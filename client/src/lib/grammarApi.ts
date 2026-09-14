/**
 * Thin wrappers around `apiRequest` for the student-facing Grammar browsing/reading
 * (T-047), practice-exercise (T-048), and game (T-049) endpoints. Same convention as
 * `lib/flashcardApi.ts` — nothing outside this file calls `fetch` against these routes
 * directly.
 */

import type {
  CheckGrammarExerciseRequest,
  CheckGrammarExerciseResponse,
  CompleteGrammarActivityRequest,
  CompleteGrammarActivityResponse,
  GrammarExercisePromptDTO,
  GrammarGameQuestionDTO,
  GrammarGameType,
  GrammarTopicProgressDTO,
  StudentGrammarTopicDetailDTO,
  StudentGrammarTopicSummaryDTO,
} from '@platform/shared';
import { apiRequest } from './apiClient';

const base = '/api/grammar-topics';

export const grammarApi = {
  listTopics: () => apiRequest<StudentGrammarTopicSummaryDTO[]>(base),
  getTopic: (topicId: string) => apiRequest<StudentGrammarTopicDetailDTO>(`${base}/${topicId}`),
  getProgress: (topicId: string) => apiRequest<GrammarTopicProgressDTO>(`${base}/${topicId}/progress`),

  listExercisePrompts: (topicId: string) =>
    apiRequest<GrammarExercisePromptDTO[]>(`${base}/${topicId}/exercises`),
  checkExerciseAnswer: (topicId: string, exerciseId: string, body: CheckGrammarExerciseRequest) =>
    apiRequest<CheckGrammarExerciseResponse>(`${base}/${topicId}/exercises/${exerciseId}/check`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // --- Grammar game (T-049) ------------------------------------------------------------
  listGameQuestions: (topicId: string) =>
    apiRequest<GrammarGameQuestionDTO[]>(`${base}/${topicId}/game-questions`),
  completeGame: (topicId: string, gameType: GrammarGameType, body: CompleteGrammarActivityRequest) =>
    apiRequest<CompleteGrammarActivityResponse>(`${base}/${topicId}/games/${gameType}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
