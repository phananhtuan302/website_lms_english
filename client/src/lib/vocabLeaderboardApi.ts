/**
 * Thin wrapper around `apiRequest` for the vocabulary leaderboard (T-031) — the one
 * vocab-progress endpoint visible to BOTH roles, so it gets its own small file rather
 * than living in the student-only `flashcardApi.ts` or teacher-only `teacherApi.ts`.
 *
 * `classId` (T-077, Phase 12): optional here since the server ignores/auto-resolves it
 * for a student caller (`resolveViewerClassId`) — a teacher/admin caller passes the class
 * they picked (or omits it while they have exactly one class, auto-selected server-side).
 */

import type { VocabLeaderboardResponseDTO } from '@platform/shared';
import { apiRequest } from './apiClient';

export const vocabLeaderboardApi = {
  getLeaderboard: (classId?: string | null) => {
    const query = classId ? `?classId=${encodeURIComponent(classId)}` : '';
    return apiRequest<VocabLeaderboardResponseDTO>(`/api/vocab-leaderboard${query}`);
  },
};
