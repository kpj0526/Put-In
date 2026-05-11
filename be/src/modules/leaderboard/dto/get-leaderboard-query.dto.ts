import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { LeaderboardDifficulty } from '../entities/leaderboard-entry.entity';

export class GetLeaderboardQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'limit는 정수여야 합니다.' })
  @Min(1, { message: 'limit는 1 이상이어야 합니다.' })
  @Max(100, { message: 'limit는 100 이하여야 합니다.' })
  limit = 10;

  @IsOptional()
  @IsIn(['easy', 'normal', 'hard'], {
    message: 'difficulty는 easy, normal, hard 중 하나여야 합니다.',
  })
  difficulty: LeaderboardDifficulty = LeaderboardDifficulty.NORMAL;
}
