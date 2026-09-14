/**
 * Thin wrappers around `apiRequest` for the teacher test-authoring (T-008),
 * variant-generation (T-009), and QR-join session (T-010) endpoints. Following the
 * existing convention (`lib/apiClient.ts`): nothing outside this file calls `fetch`
 * directly against these routes.
 */

import type {
  AcademicPeriodDTO,
  AttemptResultDTO,
  AttemptSummaryDTO,
  CreateAcademicPeriodRequest,
  CreateFlashcardCardRequest,
  CreateFlashcardSetRequest,
  CreateQuestionRequest,
  CreateSectionRequest,
  CreateSessionResponse,
  CreateTestRequest,
  CreateUnitRequest,
  FlashcardSetDetailDTO,
  FlashcardSetSummaryDTO,
  GenerateVariantsRequest,
  ReorderQuestionsRequest,
  ReorderSectionsRequest,
  TestDetailDTO,
  TestSessionDTO,
  TestSummaryDTO,
  TestVariantDTO,
  UnitDTO,
  UpdateAcademicPeriodRequest,
  UpdateFlashcardCardRequest,
  UpdateFlashcardSetRequest,
  UpdateQuestionRequest,
  UpdateSectionRequest,
  UpdateTestRequest,
  UpdateUnitRequest,
} from '@platform/shared';
import { apiRequest } from './apiClient';

const base = '/api/teacher/tests';
const teacherBase = '/api/teacher';
const flashcardBase = '/api/teacher/flashcard-sets';

export const teacherApi = {
  listTests: () => apiRequest<TestSummaryDTO[]>(base),
  createTest: (body: CreateTestRequest) =>
    apiRequest<TestDetailDTO>(base, { method: 'POST', body: JSON.stringify(body) }),
  getTest: (testId: string) => apiRequest<TestDetailDTO>(`${base}/${testId}`),
  updateTest: (testId: string, body: UpdateTestRequest) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTest: (testId: string) => apiRequest<void>(`${base}/${testId}`, { method: 'DELETE' }),

  createSection: (testId: string, body: CreateSectionRequest) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSection: (testId: string, sectionId: string, body: UpdateSectionRequest) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections/${sectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteSection: (testId: string, sectionId: string) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections/${sectionId}`, { method: 'DELETE' }),
  reorderSections: (testId: string, body: ReorderSectionsRequest) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections/reorder`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  createQuestion: (testId: string, sectionId: string, body: CreateQuestionRequest) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections/${sectionId}/questions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateQuestion: (
    testId: string,
    sectionId: string,
    questionId: string,
    body: UpdateQuestionRequest,
  ) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections/${sectionId}/questions/${questionId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteQuestion: (testId: string, sectionId: string, questionId: string) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections/${sectionId}/questions/${questionId}`, {
      method: 'DELETE',
    }),
  reorderQuestions: (testId: string, sectionId: string, body: ReorderQuestionsRequest) =>
    apiRequest<TestDetailDTO>(`${base}/${testId}/sections/${sectionId}/questions/reorder`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  generateVariants: (testId: string, body: GenerateVariantsRequest) =>
    apiRequest<TestVariantDTO[]>(`${base}/${testId}/variants`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listVariants: (testId: string) => apiRequest<TestVariantDTO[]>(`${base}/${testId}/variants`),

  startSession: (testId: string) =>
    apiRequest<CreateSessionResponse>(`${base}/${testId}/sessions`, { method: 'POST' }),
  listSessions: (testId: string) => apiRequest<TestSessionDTO[]>(`${base}/${testId}/sessions`),
  getSession: (sessionId: string) =>
    apiRequest<CreateSessionResponse>(`/api/teacher/sessions/${sessionId}`),
  closeSession: (sessionId: string) =>
    apiRequest<TestSessionDTO>(`/api/teacher/sessions/${sessionId}/close`, { method: 'POST' }),

  // --- Attempts (T-014) ------------------------------------------------------------
  listSessionAttempts: (sessionId: string) =>
    apiRequest<AttemptSummaryDTO[]>(`/api/teacher/sessions/${sessionId}/attempts`),
  getAttemptDetail: (attemptId: string) =>
    apiRequest<AttemptResultDTO>(`/api/teacher/attempts/${attemptId}`),

  // --- Curriculum tagging: Unit & Academic Period (T-018) ---------------------------
  listUnits: () => apiRequest<UnitDTO[]>(`${teacherBase}/units`),
  createUnit: (body: CreateUnitRequest) =>
    apiRequest<UnitDTO>(`${teacherBase}/units`, { method: 'POST', body: JSON.stringify(body) }),
  updateUnit: (unitId: string, body: UpdateUnitRequest) =>
    apiRequest<UnitDTO>(`${teacherBase}/units/${unitId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteUnit: (unitId: string) =>
    apiRequest<void>(`${teacherBase}/units/${unitId}`, { method: 'DELETE' }),

  listAcademicPeriods: () => apiRequest<AcademicPeriodDTO[]>(`${teacherBase}/academic-periods`),
  createAcademicPeriod: (body: CreateAcademicPeriodRequest) =>
    apiRequest<AcademicPeriodDTO>(`${teacherBase}/academic-periods`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAcademicPeriod: (periodId: string, body: UpdateAcademicPeriodRequest) =>
    apiRequest<AcademicPeriodDTO>(`${teacherBase}/academic-periods/${periodId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAcademicPeriod: (periodId: string) =>
    apiRequest<void>(`${teacherBase}/academic-periods/${periodId}`, { method: 'DELETE' }),

  // --- Flashcard sets & vocabulary words (T-022) ------------------------------------
  listFlashcardSets: () => apiRequest<FlashcardSetSummaryDTO[]>(flashcardBase),
  createFlashcardSet: (body: CreateFlashcardSetRequest) =>
    apiRequest<FlashcardSetDetailDTO>(flashcardBase, { method: 'POST', body: JSON.stringify(body) }),
  getFlashcardSet: (setId: string) =>
    apiRequest<FlashcardSetDetailDTO>(`${flashcardBase}/${setId}`),
  updateFlashcardSet: (setId: string, body: UpdateFlashcardSetRequest) =>
    apiRequest<FlashcardSetDetailDTO>(`${flashcardBase}/${setId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteFlashcardSet: (setId: string) =>
    apiRequest<void>(`${flashcardBase}/${setId}`, { method: 'DELETE' }),

  addFlashcardCard: (setId: string, body: CreateFlashcardCardRequest) =>
    apiRequest<FlashcardSetDetailDTO>(`${flashcardBase}/${setId}/cards`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateFlashcardCard: (setId: string, cardId: string, body: UpdateFlashcardCardRequest) =>
    apiRequest<FlashcardSetDetailDTO>(`${flashcardBase}/${setId}/cards/${cardId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteFlashcardCard: (setId: string, cardId: string) =>
    apiRequest<FlashcardSetDetailDTO>(`${flashcardBase}/${setId}/cards/${cardId}`, {
      method: 'DELETE',
    }),
};
