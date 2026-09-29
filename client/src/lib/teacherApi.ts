/**
 * Thin wrappers around `apiRequest` for the teacher test-authoring (T-008),
 * variant-generation (T-009), and QR-join session (T-010) endpoints. Following the
 * existing convention (`lib/apiClient.ts`): nothing outside this file calls `fetch`
 * directly against these routes.
 */

import type {
  AcademicPeriodDTO,
  AttemptResultDTO,
  AttemptSiblingsDTO,
  AttemptSummaryDTO,
  BulkCreateFlashcardCardsRequest,
  BulkCreateFlashcardCardsResponse,
  ClassAnnouncementDTO,
  ClassAssignmentsResponseDTO,
  ClassDTO,
  ClassGradebookDTO,
  ClassOverviewDTO,
  ClassRosterBulkRequestDTO,
  ClassRosterBulkResponseDTO,
  ClassRosterStudentDTO,
  ClassStudentResetPasswordResponseDTO,
  ClassesAttentionResponseDTO,
  ContentClassAssignmentDTO,
  CreateAcademicPeriodRequest,
  CreateClassAnnouncementRequest,
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
  GradeEssayAnswerResponse,
  NextUngradedAttemptDTO,
  GrammarReportGroupBy,
  GrammarReportResponseDTO,
  GrammarTopicDetailDTO,
  GrammarTopicSummaryDTO,
  ReorderQuestionsRequest,
  RegenerateVariantsResponse,
  ReorderSectionsRequest,
  ReportGroupBy,
  ReportResponseDTO,
  SentenceSubmissionDTO,
  SpeakingReportGroupBy,
  SpeakingReportResponseDTO,
  TeacherContentResponseDTO,
  TeacherStudentSummaryDTO,
  TeacherVocabProgressDTO,
  TeacherVocabularyCheckSummaryDTO,
  TestAttemptReportResponseDTO,
  TestGradingStatusDTO,
  TestClassScheduleDTO,
  TestDetailDTO,
  TestSessionDTO,
  TestSummaryDTO,
  TestType,
  TestVariantDTO,
  UnitDTO,
  UnitLeaderboardResponseDTO,
  UpdateAcademicPeriodRequest,
  UpdateClassAnnouncementRequest,
  UpdateClassCurrentPeriodRequest,
  UpdateClassRequest,
  UpdateContentClassesRequest,
  UpdateFlashcardCardRequest,
  UpdateFlashcardSetRequest,
  UpdateGrammarExerciseRequest,
  UpdateGrammarTopicRequest,
  UpdateQuestionRequest,
  UpdateSectionRequest,
  UpdateTestClassScheduleRequest,
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
  regenerateVariants: (testId: string) =>
    apiRequest<RegenerateVariantsResponse>(`${base}/${testId}/variants/regenerate`, { method: 'POST' }),

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

  // --- Per-test attempt report (T-087) ----------------------------------------------
  getTestAttemptReport: (testId: string, classId?: string | null) => {
    const query = classId ? `?classId=${encodeURIComponent(classId)}` : '';
    return apiRequest<TestAttemptReportResponseDTO>(`${base}/${testId}/attempts${query}`);
  },

  // --- Per-(test, class) availability window + score release (T-092, extended T-093, --
  // --- lightweight read added T-098 for My Content's inline settings panel) ------------
  getTestClassSchedule: (testId: string, classId: string) =>
    apiRequest<TestClassScheduleDTO>(`${base}/${testId}/schedule?classId=${encodeURIComponent(classId)}`),
  updateTestClassSchedule: (testId: string, body: UpdateTestClassScheduleRequest) =>
    apiRequest<TestClassScheduleDTO>(`${base}/${testId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // --- Manual essay grading (T-042) --------------------------------------------------
  gradeEssayAnswer: (attemptId: string, questionId: string, body: GradeEssayAnswerRequest) =>
    apiRequest<GradeEssayAnswerResponse>(
      `/api/teacher/attempts/${attemptId}/answers/${questionId}/grade`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  // --- Phase 15: next ungraded attempt + grading status behind "let students see scores" ----
  getNextUngradedAttempt: (attemptId: string) =>
    apiRequest<NextUngradedAttemptDTO>(`/api/teacher/attempts/${attemptId}/next-ungraded`),
  getTestGradingStatus: (testId: string, classId: string) =>
    apiRequest<TestGradingStatusDTO>(`${base}/${testId}/grading-status?classId=${encodeURIComponent(classId)}`),
  /** "Học sinh {{position}}/{{total}}" + "← Học sinh trước" / "Học sinh sau →" on the attempt
   * detail page — every submitted attempt of the same test/class, graded or not. */
  getAttemptSiblings: (attemptId: string) =>
    apiRequest<AttemptSiblingsDTO>(`/api/teacher/attempts/${attemptId}/siblings`),

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
  /** The class-picker version of the list above: only periods relevant to THIS teacher (their
   * own classes' semester, plus any period nobody has adopted yet) — see the server route's doc
   * comment. Used by "Tạo lớp"'s Học kỳ select and the class-header semester switcher; the
   * curriculum management page keeps using the unfiltered `listAcademicPeriods` above. */
  listSelectablePeriods: () =>
    apiRequest<AcademicPeriodDTO[]>(`${teacherBase}/academic-periods/selectable`),
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
  // T-085: bulk Excel import — one request for many rows instead of one `addFlashcardCard`
  // call per row. See `teacherFlashcards.routes.ts`'s bulk route for the partial-success
  // response shape (`created`/`errors`/`set`).
  bulkAddFlashcardCards: (setId: string, body: BulkCreateFlashcardCardsRequest) =>
    apiRequest<BulkCreateFlashcardCardsResponse>(`${flashcardBase}/${setId}/cards/bulk`, {
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

  // --- Unit Test leaderboard (T-037) ------------------------------------------------
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
  // T-099/T-100: switches which `AcademicPeriod` is presently "live" for this class
  // (the semester dropdown in the class workspace header). Returns the updated
  // `ClassDTO` (fresh `currentPeriodId`/`currentPeriodName`) so the caller can update its
  // local state without a second `listClasses()` round-trip.
  updateClassCurrentPeriod: (classId: string, body: UpdateClassCurrentPeriodRequest) =>
    apiRequest<ClassDTO>(`${teacherBase}/classes/${classId}/current-period`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // --- Content-to-class assignment + "My Content" page (T-075) ----------------------
  listMyContent: () => apiRequest<TeacherContentResponseDTO>(`${teacherBase}/content`),
  // --- Class "Bài tập" tab (T-103) ----------------------------------------------------
  // Read model: everything assigned to one class for its current semester.
  getClassAssignments: (classId: string) =>
    apiRequest<ClassAssignmentsResponseDTO>(
      `${teacherBase}/classes/${encodeURIComponent(classId)}/assignments`,
    ),
  // The read half of the read-modify-write the `PUT .../classes` endpoints below need
  // (those REPLACE the item's whole class set, so a caller must read it first).
  getTestClasses: (testId: string) =>
    apiRequest<ContentClassAssignmentDTO>(`${base}/${testId}/classes`),
  getFlashcardSetClasses: (setId: string) =>
    apiRequest<ContentClassAssignmentDTO>(`${flashcardBase}/${setId}/classes`),
  getGrammarTopicClasses: (topicId: string) =>
    apiRequest<ContentClassAssignmentDTO>(`${grammarBase}/${topicId}/classes`),
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

  // --- Class roster + gradebook (T-104) ---------------------------------------------
  getClassRoster: (classId: string) =>
    apiRequest<ClassRosterStudentDTO[]>(`${teacherBase}/classes/${encodeURIComponent(classId)}/students`),
  getClassGradebook: (classId: string) =>
    apiRequest<ClassGradebookDTO>(`${teacherBase}/classes/${encodeURIComponent(classId)}/gradebook`),

  // --- Class "Tổng quan" attention dashboard (T-107) ---------------------------------
  getClassOverview: (classId: string) =>
    apiRequest<ClassOverviewDTO>(`${teacherBase}/classes/${encodeURIComponent(classId)}/overview`),

  // --- Add students to a class (T-111) ----------------------------------------------
  addClassStudents: (classId: string, body: ClassRosterBulkRequestDTO) =>
    apiRequest<ClassRosterBulkResponseDTO>(
      `${teacherBase}/classes/${encodeURIComponent(classId)}/students/bulk`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  // Gives one student of the class a new generated password, returned once in the response.
  resetClassStudentPassword: (classId: string, studentId: string) =>
    apiRequest<ClassStudentResetPasswordResponseDTO>(
      `${teacherBase}/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/reset-password`,
      { method: 'POST' },
    ),

  // --- Class-card badges on the teacher home page ---------------------------------------
  getClassesAttention: () =>
    apiRequest<ClassesAttentionResponseDTO>(`${teacherBase}/classes-attention`),

  // --- Class announcements "Thông báo lớp" (T-108) ----------------------------------
  listClassAnnouncements: (classId: string) =>
    apiRequest<ClassAnnouncementDTO[]>(
      `${teacherBase}/classes/${encodeURIComponent(classId)}/announcements`,
    ),
  createClassAnnouncement: (classId: string, body: CreateClassAnnouncementRequest) =>
    apiRequest<ClassAnnouncementDTO>(
      `${teacherBase}/classes/${encodeURIComponent(classId)}/announcements`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  updateClassAnnouncement: (classId: string, id: string, body: UpdateClassAnnouncementRequest) =>
    apiRequest<ClassAnnouncementDTO>(
      `${teacherBase}/classes/${encodeURIComponent(classId)}/announcements/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  deleteClassAnnouncement: (classId: string, id: string) =>
    apiRequest<void>(
      `${teacherBase}/classes/${encodeURIComponent(classId)}/announcements/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
};
