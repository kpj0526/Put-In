import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  findByNickname(nickname: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { nickname } });
  }

  async create(params: {
    email: string;
    passwordHash: string;
    nickname: string;
  }): Promise<User> {
    const user = this.usersRepository.create({
      email: params.email.toLowerCase(),
      passwordHash: params.passwordHash,
      nickname: params.nickname,
    });
    return this.usersRepository.save(user);
  }
}
