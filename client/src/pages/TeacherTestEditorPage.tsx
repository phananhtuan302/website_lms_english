import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  CreateSessionResponse,
  QuestionType,
  SectionDTO,
  TestDetailDTO,
  TestSessionDTO,
  TestType,
  TestVariantDTO,
  UnitDTO,
  UpdateQuestionRequest,
  UpdateSectionRequest,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import QuestionEditor from '../components/QuestionEditor';

/** Every value `Test.testType` supports (T-036/T-038, Assumption A4) — the authoring
 * dropdown below resolves each value's label via `t('teacherTestEditor.testTypes.*')`
 * (T-068) so the option text stays in sync with the site-wide language setting. */
const TEST_TYPE_VALUES: TestType[] = [
  'generic',
  'unitTest',
  'vocabularyCheck',
  'listeningTest',
  'mockTest',
];

/** Default shape for a brand-new question of a given type — a sensible, editable
 * starting point rather than an empty/invalid one, so it saves successfully right away.
 * Takes `t` (T-068) since this seed prompt/choice text is visible to the teacher until
 * they edit it, and this function lives outside the component (no hook access there). */
function defaultQuestionBody(
  type: QuestionType,
  t: TFunction,
): {
  type: QuestionType;
  prompt: string;
  choices?: { text: string; isCorrect: boolean }[];
  acceptedAnswers?: string[];
  essayMaxScore?: number;
  allowedResponseSeconds?: number;
} {
  if (type === 'trueFalse') {
    return {
      type,
      prompt: t('teacherTestEditor.defaultQuestions.trueFalsePrompt'),
      choices: [
        { text: t('teacherTestEditor.defaultQuestions.trueOption'), isCorrect: true },
        { text: t('teacherTestEditor.defaultQuestions.falseOption'), isCorrect: false },
      ],
    };
  }
  if (type === 'fillBlank') {
    return {
      type,
      prompt: t('teacherTestEditor.defaultQuestions.fillBlankPrompt'),
      acceptedAnswers: [t('teacherTestEditor.defaultQuestions.fillBlankDefaultAnswer')],
    };
  }
  if (type === 'essay') {
    return {
      type,
      prompt: t('teacherTestEditor.defaultQuestions.essayPrompt'),
      essayMaxScore: 10,
    };
  }
  if (type === 'speaking') {
    return {
      type,
      prompt: t('teacherTestEditor.defaultQuestions.speakingPrompt'),
      allowedResponseSeconds: 60,
    };
  }
  return {
    type,
    prompt: t('teacherTestEditor.defaultQuestions.multipleChoicePrompt'),
    choices: [
      { text: t('teacherTestEditor.defaultQuestions.optionA'), isCorrect: true },
      { text: t('teacherTestEditor.defaultQuestions.optionB'), isCorrect: false },
    ],
  };
}

/**
 * Full test-authoring editor (T-008): edit the test title, manage sections and
 * questions of all three objective types (add/edit/delete/reorder), plus the
 * variant-generation panel (T-009) and QR-join session panel (T-010) for this
 * specific test.
 */
function TeacherTestEditorPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [test, setTest] = useState<TestDetailDTO | null>(null);
  const [title, setTitle] = useState('');
  const [timeLimitText, setTimeLimitText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  const [units, setUnits] = useState<UnitDTO[]>([]);

  const [variants, setVariants] = useState<TestVariantDTO[]>([]);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);

  const [sessions, setSessions] = useState<TestSessionDTO[]>([]);
  const [currentSession, setCurrentSession] = useState<CreateSessionResponse | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);

  const refreshTest = useCallback(() => {
    if (!testId) return;
    teacherApi
      .getTest(testId)
      .then((data) => {
        setTest(data);
        setTitle(data.title);
        setTimeLimitText(data.timeLimitMinutes != null ? String(data.timeLimitMinutes) : '');
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('teacherTestEditor.loadFailed')),
      );
  }, [testId, t]);

  useEffect(refreshTest, [refreshTest]);

  useEffect(() => {
    if (!testId) return;
    teacherApi
      .listVariants(testId)
      .then(setVariants)
      .catch(() => undefined);
    teacherApi
      .listSessions(testId)
      .then(setSessions)
      .catch(() => undefined);
  }, [testId]);

  // Units (T-018) — needed for the "tag this test to a Unit" dropdown below.
  useEffect(() => {
    teacherApi
      .listUnits()
      .then(setUnits)
      .catch(() => undefined);
  }, []);

  if (!testId) return null;

  async function handleSaveTitle() {
    if (!test || title.trim() === '' || title === test.title) return;
    try {
      const updated = await teacherApi.updateTest(testId!, { title: title.trim() });
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.saveTitleFailed'));
    }
  }

  async function handleSaveTimeLimit() {
    if (!test) return;
    const trimmed = timeLimitText.trim();
    const timeLimitMinutes = trimmed === '' ? null : Number(trimmed);
    if (timeLimitMinutes === test.timeLimitMinutes) return;
    if (
      timeLimitMinutes !== null &&
      (!Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1)
    ) {
      setError(t('teacherTestEditor.settings.timeLimitInvalid'));
      setTimeLimitText(test.timeLimitMinutes != null ? String(test.timeLimitMinutes) : '');
      return;
    }
    try {
      const updated = await teacherApi.updateTest(testId!, { title: test.title, timeLimitMinutes });
      setTest(updated);
      setTimeLimitText(updated.timeLimitMinutes != null ? String(updated.timeLimitMinutes) : '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.saveTimeLimitFailed'));
    }
  }

  /** T-018: optionally tag this test with a curriculum Unit. `unitId: null` clears the
   * tag (the dropdown's empty "No unit" option). */
  async function handleSaveUnit(unitId: string | null) {
    if (!test) return;
    try {
      const updated = await teacherApi.updateTest(testId!, { title: test.title, unitId });
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.saveUnitFailed'));
    }
  }

  /** T-036: tag this test's `testType` (e.g. `unitTest`) — this is the actual "a teacher
   * can tag a test as testType: unitTest" authoring action, using the same test editor
   * as every other test per Guiding Principle 6. */
  async function handleSaveTestType(testType: TestType) {
    if (!test) return;
    try {
      const updated = await teacherApi.updateTest(testId!, { title: test.title, testType });
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.saveTestTypeFailed'));
    }
  }

  /** T-036: flips whether a Unit Test is visible to students yet (`Test.published`'s
   * documented "available to students" semantics — see schema.prisma). */
  async function handleSavePublished(published: boolean) {
    if (!test) return;
    try {
      const updated = await teacherApi.updateTest(testId!, { title: test.title, published });
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.savePublishedFailed'));
    }
  }

  async function handleAddSection(event: React.FormEvent) {
    event.preventDefault();
    const sectionTitle = newSectionTitle.trim();
    if (!sectionTitle) return;
    try {
      const updated = await teacherApi.createSection(testId!, { title: sectionTitle });
      setTest(updated);
      setNewSectionTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.addSectionFailed'));
    }
  }

  async function handleSectionTitleBlur(sectionId: string, value: string, previous: string) {
    if (value.trim() === '' || value === previous) return;
    try {
      const updated = await teacherApi.updateSection(testId!, sectionId, { title: value.trim() });
      setTest(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('teacherTestEditor.errors.saveSectionTitleFailed'),
      );
    }
  }

  /** Saves one or more of a section's Reading (T-039) / Listening (T-040/T-041) content
   * fields — `title` is always resent alongside since `UpdateSectionRequest` requires it
   * (same "send full current state for fields not being patched" convention as
   * `handleSaveUnit`/question editing elsewhere on this page). */
  async function handleUpdateSectionContent(
    section: SectionDTO,
    patch: Partial<Omit<UpdateSectionRequest, 'title'>>,
  ) {
    try {
      const updated = await teacherApi.updateSection(testId!, section.id, {
        title: section.title,
        ...patch,
      });
      setTest(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('teacherTestEditor.errors.saveSectionContentFailed'),
      );
    }
  }

  async function handleDeleteSection(sectionId: string) {
    try {
      const updated = await teacherApi.deleteSection(testId!, sectionId);
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.deleteSectionFailed'));
    }
  }

  async function handleMoveSection(sectionId: string, direction: 'up' | 'down') {
    if (!test) return;
    const ids = test.sections.map((s) => s.id);
    const index = ids.indexOf(sectionId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    try {
      const updated = await teacherApi.reorderSections(testId!, { orderedSectionIds: ids });
      setTest(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('teacherTestEditor.errors.reorderSectionsFailed'),
      );
    }
  }

  async function handleAddQuestion(sectionId: string, type: QuestionType) {
    try {
      const updated = await teacherApi.createQuestion(
        testId!,
        sectionId,
        defaultQuestionBody(type, t),
      );
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.addQuestionFailed'));
    }
  }

  async function handleSaveQuestion(
    sectionId: string,
    questionId: string,
    body: UpdateQuestionRequest,
  ) {
    const updated = await teacherApi.updateQuestion(testId!, sectionId, questionId, body);
    setTest(updated);
  }

  async function handleDeleteQuestion(sectionId: string, questionId: string) {
    try {
      const updated = await teacherApi.deleteQuestion(testId!, sectionId, questionId);
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherTestEditor.errors.deleteQuestionFailed'));
    }
  }

  async function handleMoveQuestion(
    sectionId: string,
    questionId: string,
    direction: 'up' | 'down',
  ) {
    const section = test?.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const ids = section.questions.map((q) => q.id);
    const index = ids.indexOf(questionId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    try {
      const updated = await teacherApi.reorderQuestions(testId!, sectionId, {
        orderedQuestionIds: ids,
      });
      setTest(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('teacherTestEditor.errors.reorderQuestionsFailed'),
      );
    }
  }

  async function handleGenerateVariants() {
    setIsGeneratingVariants(true);
    setVariantError(null);
    try {
      await teacherApi.generateVariants(testId!, { count: 2 });
      const all = await teacherApi.listVariants(testId!);
      setVariants(all);
    } catch (err) {
      setVariantError(
        err instanceof ApiError ? err.message : t('teacherTestEditor.errors.generateVariantsFailed'),
      );
    } finally {
      setIsGeneratingVariants(false);
    }
  }

  async function handleStartSession() {
    setIsStartingSession(true);
    setSessionError(null);
    try {
      const session = await teacherApi.startSession(testId!);
      setCurrentSession(session);
      const all = await teacherApi.listSessions(testId!);
      setSessions(all);
    } catch (err) {
      setSessionError(
        err instanceof ApiError ? err.message : t('teacherTestEditor.errors.startSessionFailed'),
      );
    } finally {
      setIsStartingSession(false);
    }
  }

  async function handleCloseSession(sessionId: string) {
    try {
      await teacherApi.closeSession(sessionId);
      const all = await teacherApi.listSessions(testId!);
      setSessions(all);
      if (currentSession?.id === sessionId) {
        setCurrentSession({ ...currentSession, status: 'closed' });
      }
    } catch (err) {
      setSessionError(
        err instanceof ApiError ? err.message : t('teacherTestEditor.errors.closeSessionFailed'),
      );
    }
  }

  if (!test) {
    return (
      <div>
        <Link to="/teacher/tests" className="text-sm text-primary-600 hover:underline">
          {t('teacherTestEditor.backToTests')}
        </Link>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to="/teacher/tests" className="text-sm text-primary-600 hover:underline">
          {t('teacherTestEditor.backToTests')}
        </Link>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleSaveTitle}
          className="mt-2 w-full rounded-md border border-primary-200 px-3 py-2 text-2xl font-bold text-primary-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            {t('teacherTestEditor.settings.timeLimitLabel')}
            <input
              type="number"
              min={1}
              value={timeLimitText}
              onChange={(event) => setTimeLimitText(event.target.value)}
              onBlur={handleSaveTimeLimit}
              placeholder={t('teacherTestEditor.settings.timeLimitPlaceholder')}
              className="w-32 rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            {t('teacherTestEditor.settings.unitLabel')}
            <select
              value={test.unitId ?? ''}
              onChange={(event) =>
                handleSaveUnit(event.target.value === '' ? null : event.target.value)
              }
              className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">{t('teacherTestEditor.settings.noUnit')}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            {t('teacherTestEditor.settings.testTypeLabel')}
            <select
              value={test.testType}
              onChange={(event) => handleSaveTestType(event.target.value as TestType)}
              className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {TEST_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`teacherTestEditor.testTypes.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {test.testType === 'unitTest' && (
            <label className="flex items-center gap-2 text-sm font-medium text-base-black">
              <input
                type="checkbox"
                checked={test.published}
                onChange={(event) => handleSavePublished(event.target.checked)}
                className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
              />
              {t('teacherTestEditor.settings.publishedLabel')}
            </label>
          )}
          {test.testType === 'unitTest' && test.unitId && (
            <Link
              to={`/units/${test.unitId}/leaderboard`}
              className="text-sm font-medium text-primary-600 hover:underline"
            >
              {t('teacherTestEditor.settings.viewUnitLeaderboard')}
            </Link>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherTestEditor.sections.heading')}</h2>
        {test.sections.length === 0 && (
          <p className="text-sm text-base-black/60">{t('teacherTestEditor.sections.empty')}</p>
        )}
        {test.sections.map((section, sectionIndex) => (
          <div key={section.id} className="rounded-xl border border-primary-200 bg-primary-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                defaultValue={section.title}
                onBlur={(event) =>
                  handleSectionTitleBlur(section.id, event.target.value, section.title)
                }
                className="flex-1 rounded-md border border-primary-200 bg-base-white px-3 py-1.5 text-base font-semibold text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleMoveSection(section.id, 'up')}
                  disabled={sectionIndex === 0}
                  aria-label={t('teacherTestEditor.sections.moveUp')}
                  className="rounded px-2 py-1 text-xs text-base-black/60 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveSection(section.id, 'down')}
                  disabled={sectionIndex === test.sections.length - 1}
                  aria-label={t('teacherTestEditor.sections.moveDown')}
                  className="rounded px-2 py-1 text-xs text-base-black/60 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSection(section.id)}
                  className="ml-2 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  {t('teacherTestEditor.sections.delete')}
                </button>
              </div>
            </div>

            <details className="mt-3 rounded-lg border border-primary-100 bg-base-white p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-primary-600">
                {t('teacherTestEditor.sections.contentSummary')}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black sm:col-span-2">
                  {t('teacherTestEditor.sections.passageTextLabel')}
                  <textarea
                    defaultValue={section.passageText ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, { passageText: event.target.value || null })
                    }
                    rows={3}
                    placeholder={t('teacherTestEditor.sections.passageTextPlaceholder')}
                    className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                  {t('teacherTestEditor.sections.passageImageUrlLabel')}
                  <input
                    type="text"
                    defaultValue={section.passageImageUrl ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, { passageImageUrl: event.target.value || null })
                    }
                    placeholder={t('teacherTestEditor.sections.urlPlaceholder')}
                    className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                  {t('teacherTestEditor.sections.audioUrlLabel')}
                  <input
                    type="text"
                    defaultValue={section.audioUrl ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, { audioUrl: event.target.value || null })
                    }
                    placeholder={t('teacherTestEditor.sections.urlPlaceholder')}
                    className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                  {t('teacherTestEditor.sections.maxPlaysLabel')}
                  <input
                    type="number"
                    min={1}
                    defaultValue={section.maxPlayCount ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, {
                        maxPlayCount: event.target.value.trim() === '' ? null : Number(event.target.value),
                      })
                    }
                    placeholder={t('teacherTestEditor.sections.maxPlaysPlaceholder')}
                    className="w-40 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
              </div>
            </details>

            <div className="mt-4 flex flex-col gap-3">
              {section.questions.map((question, questionIndex) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  index={questionIndex}
                  count={section.questions.length}
                  onSave={(body) => handleSaveQuestion(section.id, question.id, body)}
                  onDelete={() => handleDeleteQuestion(section.id, question.id)}
                  onMove={(direction) => handleMoveQuestion(section.id, question.id, direction)}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'multipleChoice')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                {t('teacherTestEditor.sections.addMultipleChoice')}
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'trueFalse')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                {t('teacherTestEditor.sections.addTrueFalse')}
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'fillBlank')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                {t('teacherTestEditor.sections.addFillBlank')}
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'essay')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                {t('teacherTestEditor.sections.addEssay')}
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'speaking')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                {t('teacherTestEditor.sections.addSpeaking')}
              </button>
            </div>
          </div>
        ))}

        <form onSubmit={handleAddSection} className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherTestEditor.sections.newSectionTitleLabel')}
            <input
              type="text"
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.target.value)}
              placeholder={t('teacherTestEditor.sections.newSectionTitlePlaceholder')}
              className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            disabled={!newSectionTitle.trim()}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('teacherTestEditor.sections.addSection')}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherTestEditor.variants.heading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">
          {t('teacherTestEditor.variants.description')}
        </p>
        <button
          type="button"
          onClick={handleGenerateVariants}
          disabled={isGeneratingVariants}
          className="mt-3 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratingVariants
            ? t('teacherTestEditor.variants.generating')
            : t('teacherTestEditor.variants.generate')}
        </button>
        {variantError && <p className="mt-2 text-sm text-red-700">{variantError}</p>}
        <ul className="mt-4 flex flex-wrap gap-2">
          {variants.map((variant) => (
            <li
              key={variant.id}
              className="rounded-full bg-primary-100 px-4 py-1.5 text-sm font-semibold text-primary-700"
            >
              {t('teacherTestEditor.variants.code', { code: variant.code })}
            </li>
          ))}
          {variants.length === 0 && (
            <p className="text-sm text-base-black/60">{t('teacherTestEditor.variants.empty')}</p>
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherTestEditor.sessions.heading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">
          {t('teacherTestEditor.sessions.description')}
        </p>
        <button
          type="button"
          onClick={handleStartSession}
          disabled={isStartingSession}
          className="mt-3 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStartingSession
            ? t('teacherTestEditor.sessions.starting')
            : t('teacherTestEditor.sessions.start')}
        </button>
        {sessionError && <p className="mt-2 text-sm text-red-700">{sessionError}</p>}

        {currentSession && (
          <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 sm:flex-row sm:items-center">
            <img
              src={currentSession.qrCodeDataUrl}
              alt={t('teacherTestEditor.sessions.qrCodeAlt', { title: test.title })}
              className="h-40 w-40 rounded-md border border-primary-200 bg-base-white p-2"
            />
            <div>
              <p className="text-sm text-base-black/70">{t('teacherTestEditor.sessions.scanOrJoin')}</p>
              <p className="mt-1 break-all font-mono text-sm text-primary-700">
                {currentSession.joinUrl}
              </p>
              <p className="mt-2 text-sm text-base-black/70">
                {t('teacherTestEditor.sessions.manualFallbackCode')}{' '}
                <span className="font-mono text-lg font-bold tracking-widest text-primary-700">
                  {currentSession.manualCode}
                </span>
              </p>
              <p className="mt-1 text-xs uppercase text-base-black/50">
                {t('teacherTestEditor.sessions.statusLabel', {
                  status: t(`teacherTestEditor.sessions.statusValues.${currentSession.status}`),
                })}
              </p>
            </div>
          </div>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex items-center justify-between rounded-md border border-primary-100 px-3 py-2 text-sm"
            >
              <span>
                {t('teacherTestEditor.sessions.codeLabel')}{' '}
                <span className="font-mono font-semibold">{session.manualCode}</span> ·{' '}
                <span
                  className={session.status === 'active' ? 'text-green-700' : 'text-base-black/50'}
                >
                  {t(`teacherTestEditor.sessions.statusValues.${session.status}`)}
                </span>{' '}
                ·{' '}
                {t('teacherTestEditor.sessions.startedAt', {
                  date: new Date(session.createdAt).toLocaleString(),
                })}
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${session.id}/live`)}
                  className="text-xs font-medium text-primary-600 hover:underline"
                >
                  {t('teacherTestEditor.sessions.liveMonitor')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${session.id}/attempts`)}
                  className="text-xs font-medium text-primary-600 hover:underline"
                >
                  {t('teacherTestEditor.sessions.viewAttempts')}
                </button>
                {session.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleCloseSession(session.id)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    {t('teacherTestEditor.sessions.close')}
                  </button>
                )}
              </span>
            </li>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-base-black/60">{t('teacherTestEditor.sessions.empty')}</p>
          )}
        </ul>
      </section>
    </div>
  );
}

export default TeacherTestEditorPage;
