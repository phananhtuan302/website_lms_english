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
  CompleteVocabActivityRequest,
  CompleteVocabActivityResponse,
  FlashcardProgressDTO,
  GameWordDTO,
  MatchingMode,
  MatchingPairDTO,
  SelfCheckAnswerResponse,
  SelfCheckPromptDTO,
  SentencePromptDTO,
  StudentFlashcardSetDetailDTO,
  StudentFlashcardSetSummaryDTO,
  StudentVocabProgressDTO,
  SubmitSentenceRequest,
  SubmitSentenceResponse,
  UpdateFlashcardProgressRequest,
  VocabExercisePromptDTO,
  VocabExerciseType,
  VocabGameType,
} from '@platform/shared';
import { apiRequest } from './apiClient';

const base = '/api/flashcard-sets';

export const flashcardApi = {
  listSets: () => apiRequest<StudentFlashcardSetSummaryDTO[]>(base),
  getSet: (setId: string) => apiRequest<StudentFlashcardSetDetailDTO>(`${base}/${setId}`),

  // --- Progress tracking (T-030) -------------------------------------------------------
  getMyProgress: () => apiRequest<StudentVocabProgressDTO>(`${base}/progress`),
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

  // --- Self-check quiz for mastered cards (T-089) -------------------------------------
  listSelfCheckPrompts: (setId: string) => apiRequest<SelfCheckPromptDTO[]>(`${base}/${setId}/self-check`),
  answerSelfCheck: (setId: string, cardId: string, body: CheckVocabExerciseRequest) =>
    apiRequest<SelfCheckAnswerResponse>(`${base}/${setId}/self-check/${cardId}/answer`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // --- Matching exercise (T-028) ------------------------------------------------------
  listMatchingPairs: (setId: string, mode: MatchingMode) =>
    apiRequest<MatchingPairDTO[]>(`${base}/${setId}/matching/${mode}`),
  completeMatching: (setId: string, mode: MatchingMode, body: CompleteVocabActivityRequest) =>
    apiRequest<CompleteVocabActivityResponse>(`${base}/${setId}/matching/${mode}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // --- Use-word-in-a-sentence exercise (T-029) ----------------------------------------
  listSentencePrompts: (setId: string) => apiRequest<SentencePromptDTO[]>(`${base}/${setId}/sentence-prompts`),
  submitSentence: (setId: string, cardId: string, body: SubmitSentenceRequest) =>
    apiRequest<SubmitSentenceResponse>(`${base}/${setId}/sentence/${cardId}/submit`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // --- Vocab games: space shooter (T-034) and runner (T-035) --------------------------
  listGameWords: (setId: string) => apiRequest<GameWordDTO[]>(`${base}/${setId}/game-words`),
  completeGame: (setId: string, gameType: VocabGameType, body: CompleteVocabActivityRequest) =>
    apiRequest<CompleteVocabActivityResponse>(`${base}/${setId}/games/${gameType}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
