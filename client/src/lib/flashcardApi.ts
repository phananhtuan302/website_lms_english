/**
 * Thin wrappers around `apiRequest` for the student-facing flashcard study mode
 * (T-023) and vocabulary exercise (T-024–T-027) endpoints. Same convention as
 * `lib/studentApi.ts`/`lib/teacherApi.ts` — nothing outside this file calls `fetch`
 * against these routes directly. Kept as its own file (rather than folded into
 * `studentApi.ts`, which is attempt/test-runtime specific) since it's a sizeable,
 * self-contained feature area.
 */

import type {
  CheckVocabExerciseRequest,
  CheckVocabExerciseResponse,
  FlashcardProgressDTO,
  StudentFlashcardSetDetailDTO,
  StudentFlashcardSetSummaryDTO,
  UpdateFlashcardProgressRequest,
  VocabExercisePromptDTO,
  VocabExerciseType,
} from '@platform/shared';
import { apiRequest } from './apiClient';

const base = '/api/flashcard-sets';

export const flashcardApi = {
  listSets: () => apiRequest<StudentFlashcardSetSummaryDTO[]>(base),
  getSet: (setId: string) => apiRequest<StudentFlashcardSetDetailDTO>(`${base}/${setId}`),
  setCardProgress: (setId: string, cardId: string, body: UpdateFlashcardProgressRequest) =>
    apiRequest<FlashcardProgressDTO>(`${base}/${setId}/cards/${cardId}/progress`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  listExercisePrompts: (setId: string, type: VocabExerciseType) =>
    apiRequest<VocabExercisePromptDTO[]>(`${base}/${setId}/exercises/${type}`),
  checkExerciseAnswer: (
    setId: string,
    type: VocabExerciseType,
    cardId: string,
    body: CheckVocabExerciseRequest,
  ) =>
    apiRequest<CheckVocabExerciseResponse>(`${base}/${setId}/exercises/${type}/${cardId}/check`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
