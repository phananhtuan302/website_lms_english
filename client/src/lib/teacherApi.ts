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
  ClassDTO,
  ContentClassAssignmentDTO,
  CreateAcademicPeriodRequest,
  CreateClassRequest,
  CreateFlashcardCardRequest,
  CreateFlashcardSetRequest,
  CreateGrammarExerciseRequest,
  CreateGrammarTopicRequest,
  CreateQuestionRequest,
  CreateSectionRequest,
  CreateSessionResponse,
  CreateTestRequest,
  CreateUnitRequest,
  FlashcardSetDetailDTO,
  FlashcardSetSummaryDTO,
  GenerateVariantsRequest,
  GenerateVocabularyCheckRequest,
  GradeEssayAnswerRequest,
  GrammarReportGroupBy,
  GrammarReportResponseDTO,
  GrammarTopicDetailDTO,
  GrammarTopicSummaryDTO,
  ReorderQuestionsRequest,
  ReorderSectionsRequest,
  ReportGroupBy,
  ReportResponseDTO,
  SentenceSubmissionDTO,
  SpeakingReportGroupBy,
  SpeakingReportResponseDTO,
  TeacherContentResponseDTO,
  TeacherStudentSummaryDTO,
  TeacherUnitTestsResponseDTO,
  TeacherVocabProgressDTO,
  TeacherVocabularyCheckSummaryDTO,
  TestDetailDTO,
  TestSessionDTO,
  TestSummaryDTO,
  TestType,
  TestVariantDTO,
  UnitDTO,
  UnitLeaderboardResponseDTO,
  UpdateAcademicPeriodRequest,
  UpdateClassRequest,
  UpdateContentClassesRequest,
  UpdateFlashcardCardRequest,
  UpdateFlashcardSetRequest,
  UpdateGrammarExerciseRequest,
  UpdateGrammarTopicRequest,
  UpdateQuestionRequest,
  UpdateSectionRequest,
  UpdateTestRequest,
  UpdateUnitRequest,
  VocabPeriodLeaderboardResponseDTO,
} from '@platform/shared';
import { apiRequest } from './apiClient';

const base = '/api/teacher/tests';
const teacherBase = '/api/teacher';
const flashcardBase = '/api/teacher/flashcard-sets';
const grammarBase = '/api/teacher/grammar-topics';

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

  // --- Manual essay grading (T-042) --------------------------------------------------
  gradeEssayAnswer: (attemptId: string, questionId: string, body: GradeEssayAnswerRequest) =>
    apiRequest<{ questionId: string; manualScore: number; manualComment: string | null }>(
      `/api/teacher/attempts/${attemptId}/answers/${questionId}/grade`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

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

  // --- Sentence submissions, read-only (T-029) --------------------------------------
  listSentenceSubmissions: (setId: string) =>
    apiRequest<SentenceSubmissionDTO[]>(`${flashcardBase}/${setId}/sentence-submissions`),

  // --- Reporting engine v1 (T-019) --------------------------------------------------
  getReport: (params: {
    groupBy: ReportGroupBy;
    testId?: string | null;
    unitId?: string | null;
    testType?: TestType | null;
    /** Required by the server (T-077) — optional here only so a caller mid-picking a
     * class (no selection yet) can simply not call this until it has one, same "don't
     * fire the request yet" pattern every other required-filter caller in this file uses. */
    classId?: string | null;
  }) => {
    const query = new URLSearchParams({ groupBy: params.groupBy });
    if (params.testId) query.set('testId', params.testId);
    if (params.unitId) query.set('unitId', params.unitId);
    if (params.testType) query.set('testType', params.testType);
    if (params.classId) query.set('classId', params.classId);
    return apiRequest<ReportResponseDTO>(`${teacherBase}/reports?${query.toString()}`);
  },

  // --- Speaking reports (T-057) ------------------------------------------------------
  getSpeakingReport: (params: {
    groupBy: SpeakingReportGroupBy;
    testId?: string | null;
    unitId?: string | null;
    classId?: string | null;
  }) => {
    const query = new URLSearchParams({ groupBy: params.groupBy });
    if (params.testId) query.set('testId', params.testId);
    if (params.unitId) query.set('unitId', params.unitId);
    if (params.classId) query.set('classId', params.classId);
    return apiRequest<SpeakingReportResponseDTO>(`${teacherBase}/speaking-reports?${query.toString()}`);
  },

  // --- Vocabulary progress (T-030) + monthly/yearly ranking (T-032/T-033) ------------
  getVocabSetProgress: (setId: string) =>
    apiRequest<TeacherVocabProgressDTO>(`${flashcardBase}/${setId}/progress`),
  getMonthlyVocabRanking: (year: number, month: number, classId?: string | null) => {
    const query = new URLSearchParams({ year: String(year), month: String(month) });
    if (classId) query.set('classId', classId);
    return apiRequest<VocabPeriodLeaderboardResponseDTO>(
      `${teacherBase}/vocab-leaderboard/monthly?${query.toString()}`,
    );
  },
  getYearlyVocabRanking: (year: number, classId?: string | null) => {
    const query = new URLSearchParams({ year: String(year) });
    if (classId) query.set('classId', classId);
    return apiRequest<VocabPeriodLeaderboardResponseDTO>(
      `${teacherBase}/vocab-leaderboard/yearly?${query.toString()}`,
    );
  },

  // --- Grammar topics & exercises (T-046/T-047/T-048) --------------------------------
  listGrammarTopics: () => apiRequest<GrammarTopicSummaryDTO[]>(grammarBase),
  createGrammarTopic: (body: CreateGrammarTopicRequest) =>
    apiRequest<GrammarTopicDetailDTO>(grammarBase, { method: 'POST', body: JSON.stringify(body) }),
  getGrammarTopic: (topicId: string) =>
    apiRequest<GrammarTopicDetailDTO>(`${grammarBase}/${topicId}`),
  updateGrammarTopic: (topicId: string, body: UpdateGrammarTopicRequest) =>
    apiRequest<GrammarTopicDetailDTO>(`${grammarBase}/${topicId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteGrammarTopic: (topicId: string) =>
    apiRequest<void>(`${grammarBase}/${topicId}`, { method: 'DELETE' }),

  createGrammarExercise: (topicId: string, body: CreateGrammarExerciseRequest) =>
    apiRequest<GrammarTopicDetailDTO>(`${grammarBase}/${topicId}/exercises`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateGrammarExercise: (topicId: string, exerciseId: string, body: UpdateGrammarExerciseRequest) =>
    apiRequest<GrammarTopicDetailDTO>(`${grammarBase}/${topicId}/exercises/${exerciseId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteGrammarExercise: (topicId: string, exerciseId: string) =>
    apiRequest<GrammarTopicDetailDTO>(`${grammarBase}/${topicId}/exercises/${exerciseId}`, {
      method: 'DELETE',
    }),

  // --- Grammar reports (T-050) --------------------------------------------------------
  getGrammarReport: (params: {
    groupBy: GrammarReportGroupBy;
    topicId?: string | null;
    studentId?: string | null;
    classId?: string | null;
  }) => {
    const query = new URLSearchParams({ groupBy: params.groupBy });
    if (params.topicId) query.set('topicId', params.topicId);
    if (params.studentId) query.set('studentId', params.studentId);
    if (params.classId) query.set('classId', params.classId);
    return apiRequest<GrammarReportResponseDTO>(`${teacherBase}/grammar-reports?${query.toString()}`);
  },

  // --- Unit Test management (T-036) + leaderboard (T-037) ---------------------------
  listUnitTests: () => apiRequest<TeacherUnitTestsResponseDTO>(`${teacherBase}/unit-tests`),
  getUnitLeaderboard: (unitId: string, classId?: string | null) => {
    const query = classId ? `?classId=${encodeURIComponent(classId)}` : '';
    return apiRequest<UnitLeaderboardResponseDTO>(`/api/units/${unitId}/leaderboard${query}`);
  },

  // --- Vocabulary Check generation (T-038) -------------------------------------------
  listStudents: () => apiRequest<TeacherStudentSummaryDTO[]>(`${teacherBase}/students`),
  listVocabularyChecks: () =>
    apiRequest<TeacherVocabularyCheckSummaryDTO[]>(`${teacherBase}/vocabulary-checks`),
  generateVocabularyCheck: (body: GenerateVocabularyCheckRequest) =>
    apiRequest<TeacherVocabularyCheckSummaryDTO>(`${teacherBase}/vocabulary-checks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // --- Class management (T-074) -----------------------------------------------------
  listClasses: () => apiRequest<ClassDTO[]>(`${teacherBase}/classes`),
  createClass: (body: CreateClassRequest) =>
    apiRequest<ClassDTO>(`${teacherBase}/classes`, { method: 'POST', body: JSON.stringify(body) }),
  updateClass: (classId: string, body: UpdateClassRequest) =>
    apiRequest<ClassDTO>(`${teacherBase}/classes/${classId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteClass: (classId: string) =>
    apiRequest<void>(`${teacherBase}/classes/${classId}`, { method: 'DELETE' }),

  // --- Content-to-class assignment + "My Content" page (T-075) ----------------------
  listMyContent: () => apiRequest<TeacherContentResponseDTO>(`${teacherBase}/content`),
  updateTestClasses: (testId: string, body: UpdateContentClassesRequest) =>
    apiRequest<ContentClassAssignmentDTO>(`${base}/${testId}/classes`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  updateFlashcardSetClasses: (setId: string, body: UpdateContentClassesRequest) =>
    apiRequest<ContentClassAssignmentDTO>(`${flashcardBase}/${setId}/classes`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  updateGrammarTopicClasses: (topicId: string, body: UpdateContentClassesRequest) =>
    apiRequest<ContentClassAssignmentDTO>(`${grammarBase}/${topicId}/classes`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};
