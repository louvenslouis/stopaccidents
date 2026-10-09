import type { AvatarConfig } from '@/features/profile/avatar';
export type LeaderboardPeriod = 'all' | 'week' | 'month';
export type LeaderboardScope = 'country' | 'commune';
export type LeaderboardEntry = {
  avatar?: AvatarConfig | null;
  alias: string;
  points: number;
  rank: number;
  is_me: boolean;
};
export type LeaderboardPage = {
  entries: LeaderboardEntry[];
  total: number;
  me: (Omit<LeaderboardEntry, 'rank'> & { rank: number | null }) | null;
};
export const leaderboardPeriods = [
  { id: 'all', label: 'Tous les temps' },
  { id: 'week', label: 'Hebdomadaire' },
  { id: 'month', label: 'Mensuel' },
] as const;
