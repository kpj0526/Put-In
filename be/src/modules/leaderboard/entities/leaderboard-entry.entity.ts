import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum Judgement {
  PERFECT_CHARGE = 'PERFECT_CHARGE',
  GREAT = 'GREAT',
  GOOD = 'GOOD',
  WEAK = 'WEAK',
  BAD = 'BAD',
  MISS = 'MISS',
}

@Index('idx_leaderboard_entries_rank', ['accuracy', 'createdAt'])
@Entity({ name: 'leaderboard_entries' })
export class LeaderboardEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'nickname_snapshot', type: 'varchar', length: 12 })
  nicknameSnapshot!: string;

  @Column({ type: 'smallint' })
  accuracy!: number;

  @Column({ type: 'varchar', length: 20 })
  judgement!: Judgement;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @ManyToOne(() => User, (user) => user.leaderboardEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
