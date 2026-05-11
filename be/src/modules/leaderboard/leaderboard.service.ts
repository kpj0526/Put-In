import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  Judgement,
  LeaderboardDifficulty,
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

  async create(
    userId: string,
    accuracy: number,
    difficulty: LeaderboardDifficulty = LeaderboardDifficulty.NORMAL,
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: '기록 저장을 위해 로그인이 필요합니다.',
      });
    }

    const currentBest = await this.leaderboardRepository.findOne({
      where: { userId: user.id, difficulty },
      order: {
        accuracy: 'DESC',
        createdAt: 'ASC',
      },
    });

    if (currentBest && currentBest.accuracy >= accuracy) {
      const rank = await this.getRank(currentBest.id, difficulty);
      return this.toResponseEntry(currentBest, rank);
    }

    const entry = await this.leaderboardRepository.save(
      this.leaderboardRepository.create({
        userId: user.id,
        nicknameSnapshot: user.nickname,
        accuracy,
        difficulty,
        judgement: this.getJudgement(accuracy),
      }),
    );

    const rank = await this.getRank(entry.id, difficulty);
    return this.toResponseEntry(entry, rank);
  }

  async findTop(
    limit: number,
    difficulty: LeaderboardDifficulty = LeaderboardDifficulty.NORMAL,
  ) {
    const entries = await this.leaderboardRepository.find({
      where: { difficulty },
      order: {
        accuracy: 'DESC',
        createdAt: 'ASC',
      },
    });

    return this.getBestEntriesByUser(entries)
      .slice(0, limit)
      .map((entry, index) => this.toResponseEntry(entry, index + 1));
  }

  private async getRank(
    entryId: string,
    difficulty: LeaderboardDifficulty,
  ): Promise<number> {
    const orderedEntries = await this.leaderboardRepository.find({
      where: { difficulty },
      order: {
        accuracy: 'DESC',
        createdAt: 'ASC',
      },
    });
    const bestEntries = this.getBestEntriesByUser(orderedEntries);
    const index = bestEntries.findIndex((entry) => entry.id === entryId);
    return index === -1 ? bestEntries.length : index + 1;
  }

  private getBestEntriesByUser(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    const seenUserIds = new Set<string>();
    return entries.filter((entry) => {
      if (seenUserIds.has(entry.userId)) {
        return false;
      }
      seenUserIds.add(entry.userId);
      return true;
    });
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
      difficulty: entry.difficulty,
      judgement: entry.judgement,
      createdAt: entry.createdAt,
    };
  }
}
