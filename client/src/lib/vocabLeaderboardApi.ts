/**
 * Thin wrapper around `apiRequest` for the vocabulary leaderboard (T-031) — the one
 * vocab-progress endpoint visible to BOTH roles, so it gets its own small file rather
 * than living in the student-only `flashcardApi.ts` or teacher-only `teacherApi.ts`.
 */

import type { VocabLeaderboardResponseDTO } from '@platform/shared';
import { apiRequest } from './apiClient';

export const vocabLeaderboardApi = {
  getLeaderboard: () => apiRequest<VocabLeaderboardResponseDTO>('/api/vocab-leaderboard'),
};
