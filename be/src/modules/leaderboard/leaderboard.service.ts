import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  Judgement,
  LeaderboardEntry,
} from './entities/leaderboard-entry.entity';

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(LeaderboardEntry)
    private readonly leaderboardRepository: Repository<LeaderboardEntry>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(userId: string, accuracy: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '기록 저장을 위해 로그인이 필요합니다.',
      });
    }

    const entry = await this.leaderboardRepository.save(
      this.leaderboardRepository.create({
        userId: user.id,
        nicknameSnapshot: user.nickname,
        accuracy,
        judgement: this.getJudgement(accuracy),
      }),
    );

    const rank = await this.getRank(entry.id);
    return this.toResponseEntry(entry, rank);
  }

  async findTop(limit: number) {
    const entries = await this.leaderboardRepository.find({
      order: {
        accuracy: 'DESC',
        createdAt: 'ASC',
      },
      take: limit,
    });

    return entries.map((entry, index) => this.toResponseEntry(entry, index + 1));
  }

  private async getRank(entryId: string): Promise<number> {
    const orderedEntries = await this.leaderboardRepository.find({
      select: ['id'],
      order: {
        accuracy: 'DESC',
        createdAt: 'ASC',
      },
    });
    const index = orderedEntries.findIndex((entry) => entry.id === entryId);
    return index === -1 ? orderedEntries.length : index + 1;
  }

  private getJudgement(accuracy: number): Judgement {
    if (accuracy === 100) {
      return Judgement.PERFECT_CHARGE;
    }
    if (accuracy >= 90) {
      return Judgement.GREAT;
    }
    if (accuracy >= 70) {
      return Judgement.GOOD;
    }
    if (accuracy >= 40) {
      return Judgement.WEAK;
    }
    if (accuracy >= 1) {
      return Judgement.BAD;
    }
    return Judgement.MISS;
  }

  private toResponseEntry(entry: LeaderboardEntry, rank: number) {
    return {
      id: entry.id,
      rank,
      userId: entry.userId,
      nickname: entry.nicknameSnapshot,
      accuracy: entry.accuracy,
      judgement: entry.judgement,
      createdAt: entry.createdAt,
    };
  }
}
