import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './entities/refresh-token.entity';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

const FORBIDDEN_NICKNAME_WORDS = ['admin', 'root', 'operator', 'manager'];

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
  ) {}

  async register(registerDto: RegisterDto) {
    await this.ensureUniqueUser(registerDto.email, registerDto.nickname);

    if (this.hasForbiddenNickname(registerDto.nickname)) {
      throw new ConflictException({
        code: 'NICKNAME_NOT_ALLOWED',
        message: 'This nickname cannot be used.',
      });
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 12);
    const user = await this.usersService.create({
      email: registerDto.email,
      passwordHash,
      nickname: registerDto.nickname,
    });
    const tokens = await this.issueTokenPair(user);

    return {
      user: this.toPublicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    const isValidPassword =
      user && (await bcrypt.compare(loginDto.password, user.passwordHash));

    if (!user || !isValidPassword) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is invalid.',
      });
    }

    const tokens = await this.issueTokenPair(user);

    return {
      user: this.toPublicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async refresh(rawRefreshToken: string | undefined): Promise<TokenPair> {
    if (!rawRefreshToken) {
      throw this.invalidRefreshTokenException();
    }

    let payload: { sub: string; tokenId: string };
    try {
      payload = await this.jwtService.verifyAsync(rawRefreshToken, {
        secret: this.getRefreshSecret(),
      });
    } catch {
      throw this.invalidRefreshTokenException();
    }

    const tokenRecord = await this.refreshTokensRepository.findOne({
      where: { id: payload.tokenId },
    });

    if (!tokenRecord || tokenRecord.expiresAt.getTime() < Date.now()) {
      throw this.invalidRefreshTokenException();
    }

    if (tokenRecord.revokedAt) {
      await this.revokeAllUserTokens(payload.sub);
      throw this.invalidRefreshTokenException();
    }

    const isValidToken = await bcrypt.compare(
      rawRefreshToken,
      tokenRecord.tokenHash,
    );

    if (!isValidToken) {
      await this.revokeAllUserTokens(payload.sub);
      throw this.invalidRefreshTokenException();
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw this.invalidRefreshTokenException();
    }

    await this.refreshTokensRepository.update(tokenRecord.id, {
      revokedAt: new Date(),
    });

    return this.issueTokenPair(user);
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        tokenId: string;
      }>(rawRefreshToken, { secret: this.getRefreshSecret() });
      await this.refreshTokensRepository.update(payload.tokenId, {
        revokedAt: new Date(),
      });
    } catch {
      return;
    }
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required.',
      });
    }

    return this.toPublicUser(user);
  }

  private async ensureUniqueUser(email: string, nickname: string) {
    const [emailUser, nicknameUser] = await Promise.all([
      this.usersService.findByEmail(email),
      this.usersService.findByNickname(nickname),
    ]);

    if (emailUser) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email is already registered.',
      });
    }

    if (nicknameUser) {
      throw new ConflictException({
        code: 'NICKNAME_ALREADY_EXISTS',
        message: 'Nickname is already in use.',
      });
    }
  }

  private async issueTokenPair(user: {
    id: string;
    email: string;
    nickname: string;
  }): Promise<TokenPair> {
    const refreshTokenRecord = await this.refreshTokensRepository.save(
      this.refreshTokensRepository.create({
        userId: user.id,
        tokenHash: `pending-${randomUUID()}`,
        expiresAt: new Date(Date.now() + this.getRefreshExpiresMs()),
      }),
    );

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, nickname: user.nickname },
      {
        secret: this.getAccessSecret(),
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES',
          '15m',
        ) as never,
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, tokenId: refreshTokenRecord.id },
      {
        secret: this.getRefreshSecret(),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES',
          '14d',
        ) as never,
      },
    );

    refreshTokenRecord.tokenHash = await bcrypt.hash(refreshToken, 12);
    await this.refreshTokensRepository.save(refreshTokenRecord);

    return { accessToken, refreshToken };
  }

  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokensRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at is null')
      .execute();
  }

  private hasForbiddenNickname(nickname: string): boolean {
    const normalizedNickname = nickname.toLowerCase();
    return FORBIDDEN_NICKNAME_WORDS.some((word) =>
      normalizedNickname.includes(word.toLowerCase()),
    );
  }

  private invalidRefreshTokenException() {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Login has expired. Please log in again.',
    });
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    nickname: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private getAccessSecret(): string {
    return this.configService.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret');
  }

  private getRefreshSecret(): string {
    return this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'dev-refresh-secret',
    );
  }

  private getRefreshExpiresMs(): number {
    return Number(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_MS', '1209600000'),
    );
  }
}
