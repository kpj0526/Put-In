import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateLeaderboardEntryDto } from './dto/create-leaderboard-entry.dto';
import { GetLeaderboardQueryDto } from './dto/get-leaderboard-query.dto';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Body() createDto: CreateLeaderboardEntryDto,
  ) {
    const entry = await this.leaderboardService.create(
      currentUser.sub,
      createDto.accuracy,
      createDto.difficulty,
    );
    return { entry };
  }

  @Get()
  async findTop(@Query() query: GetLeaderboardQueryDto) {
    const entries = await this.leaderboardService.findTop(
      query.limit,
      query.difficulty,
    );
    return { entries };
  }
}
