import { IsInt, Max, Min } from 'class-validator';

export class CreateLeaderboardEntryDto {
  @IsInt({ message: '정확도는 정수여야 합니다.' })
  @Min(0, { message: '정확도는 0 이상이어야 합니다.' })
  @Max(100, { message: '정확도는 100 이하여야 합니다.' })
  accuracy!: number;
}
