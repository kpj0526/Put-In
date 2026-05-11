alter table leaderboard_entries
  add column if not exists difficulty varchar(10) not null default 'normal';

create index if not exists idx_leaderboard_entries_difficulty_rank
  on leaderboard_entries (difficulty, accuracy desc, created_at asc);
