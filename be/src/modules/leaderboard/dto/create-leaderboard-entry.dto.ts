import { IsIn, IsInt, Max, Min } from 'class-validator';
import { LeaderboardDifficulty } from '../entities/leaderboard-entry.entity';

export class CreateLeaderboardEntryDto {
  @IsInt({ message: '정확도는 정수여야 합니다.' })
  @Min(0, { message: '정확도는 0 이상이어야 합니다.' })
  @Max(100, { message: '정확도는 100 이하여야 합니다.' })
  accuracy!: number;

  @IsIn(['easy', 'normal', 'hard'], {
    message: 'difficulty는 easy, normal, hard 중 하나여야 합니다.',
  })
  difficulty: LeaderboardDifficulty = LeaderboardDifficulty.NORMAL;
}
