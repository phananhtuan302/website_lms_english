import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  CreateSessionResponse,
  QuestionType,
  TestDetailDTO,
  TestSessionDTO,
  TestType,
  TestVariantDTO,
  UnitDTO,
  UpdateQuestionRequest,
  UpdateSectionRequest,
  UpdateTestRequest,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { EditorSaveContext, useEditorSaveStore, useSerialSaver } from '../lib/editorSave';
import { friendlyEditorError, rawErrorText } from '../lib/editorErrors';
import { HoldSave } from '../lib/serialSaver';
import { sendKeepalive } from '../lib/keepaliveRequest';
import TestSectionEditor from '../components/TestSectionEditor';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';
import SaveStatusBar from '../components/SaveStatusBar';
import TestPreviewModal from '../components/TestPreviewModal';
import AssignTestToClassesDialog from '../components/AssignTestToClassesDialog';

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
 * starting point rather than an empty/invalid one, so it saves successfully right away. A new
 * multiple-choice question starts with four answers (A–D) and A marked correct.
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
  if (type === 'matching') {
    return {
      type,
      prompt: t('teacherTestEditor.defaultQuestions.matchingPrompt'),
      choices: ['i', 'ii', 'iii', 'iv'].map((label, index) => ({
        text: t('teacherTestEditor.defaultQuestions.matchingOption', { label }),
        isCorrect: index === 0,
      })),
    };
  }
  return {
    type,
    prompt: t('teacherTestEditor.defaultQuestions.multipleChoicePrompt'),
    choices: ['A', 'B', 'C', 'D'].map((letter, index) => ({
      text: t('teacherTestEditor.defaultQuestions.option', { letter }),
      isCorrect: index === 0,
    })),
  };
}

/** A brand-new `matching` question's starting choices (2026-09, IELTS Reading "match a
 * paragraph to a heading" support) — copies the option list from the PREVIOUS `matching`
 * question already in this section, if there is one, instead of the generic i/ii/iii/iv
 * placeholder. Real IELTS matching sections reuse one heading/option list across many
 * questions; without this, a teacher would have to retype that whole list by hand for
 * every single question (a real IELTS-teacher review's explicit complaint). Correctness
 * always resets to the first option — copying which one was "correct" for a DIFFERENT
 * paragraph would be actively misleading, not a helpful default. */
function matchingQuestionBody(
  existingQuestions: Array<{ type: QuestionType; choices: Array<{ text: string }> }> | undefined,
  t: TFunction,
): { type: 'matching'; prompt: string; choices: { text: string; isCorrect: boolean }[] } {
  const previousMatching = [...(existingQuestions ?? [])].reverse().find((q) => q.type === 'matching');
  if (previousMatching && previousMatching.choices.length > 0) {
    return {
      type: 'matching',
      prompt: t('teacherTestEditor.defaultQuestions.matchingPrompt'),
      choices: previousMatching.choices.map((c, index) => ({ text: c.text, isCorrect: index === 0 })),
    };
  }
  return defaultQuestionBody('matching', t) as {
    type: 'matching';
    prompt: string;
    choices: { text: string; isCorrect: boolean }[];
  };
}

/** The title block of the editor: everything `PATCH /tests/:id` saves. */
interface MetaDraft {
  title: string;
  timeLimitText: string;
  unitId: string | null;
  testType: TestType;
  published: boolean;
}

const NUMBER_DEBOUNCE_MS = 300;

const selectClass =
  'rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';

/**
 * Full test-authoring editor (T-008): edit the test title, manage question groups ("nhóm câu")
 * and questions of every type (add / edit / delete / reorder), preview the test as a student, give
 * it to classes, see its automatic variants (T-009) and start a QR-join session (T-010).
 *
 * There is no Save button: every edit is saved by itself (see `serialSaver.ts` /
 * `editorSave.ts`) and the sticky line at the top always says whether the work is safe.
 */
function TeacherTestEditorPage() {
  const { testId } = useParams<{ testId: string }>();
  const store = useEditorSaveStore();
  const { hasUnsaved, flushAllOnUnload } = store;

  // Closing / reloading the tab: send whatever is still waiting (keepalive) and, only while
  // something is unsaved, let the browser ask before leaving.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsaved()) return;
      flushAllOnUnload();
      event.preventDefault();
      event.returnValue = '';
    }
    function onPageHide() {
      flushAllOnUnload();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [hasUnsaved, flushAllOnUnload]);

  if (!testId) return null;
  return (
    <EditorSaveContext.Provider value={store.tracker}>
      <TestEditorBody key={testId} testId={testId} status={store.status} />
    </EditorSaveContext.Provider>
  );
}

function TestEditorBody({
  testId,
  status,
}: {
  testId: string;
  status: ReturnType<typeof useEditorSaveStore>['status'];
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tracker = useContext(EditorSaveContext);
  const [test, setTest] = useState<TestDetailDTO | null>(null);
  const [meta, setMeta] = useState<MetaDraft | null>(null);
  const metaRef = useRef<MetaDraft | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');

  const [units, setUnits] = useState<UnitDTO[]>([]);

  const [variants, setVariants] = useState<TestVariantDTO[]>([]);
  const [variantNote, setVariantNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isRegeneratingVariants, setIsRegeneratingVariants] = useState(false);

  const [sessions, setSessions] = useState<TestSessionDTO[]>([]);
  const [currentSession, setCurrentSession] = useState<CreateSessionResponse | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);

  const [showPreview, setShowPreview] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Adding / deleting / reordering happen one after another, in click order, so two quick clicks
  // can never make an older response overwrite a newer one.
  const structureQueue = useRef<Promise<void>>(Promise.resolve());

  // Ids of multiple-choice questions created by "+ Trắc nghiệm" in THIS editing session that the
  // teacher has not touched since (its sample text and pre-marked "A" answer are still exactly
  // what the button put there) — see `handleAddQuestion`. A plain ref, not state: it only needs
  // reading once, at the moment "Giao bài này cho lớp…" is clicked, not on every keystroke.
  const freshQuestionIds = useRef<Set<string>>(new Set());
  const isQuestionFreshDefault = useCallback(
    (questionId: string) => freshQuestionIds.current.has(questionId),
    [],
  );
  const onQuestionFirstEdit = useCallback((questionId: string) => {
    freshQuestionIds.current.delete(questionId);
  }, []);

  const refreshVariants = useCallback(() => {
    teacherApi
      .listVariants(testId)
      .then(setVariants)
      .catch(() => undefined);
  }, [testId]);

  useEffect(() => {
    teacherApi
      .getTest(testId)
      .then((data) => {
        setTest(data);
        const initial: MetaDraft = {
          title: data.title,
          timeLimitText: data.timeLimitMinutes != null ? String(data.timeLimitMinutes) : '',
          unitId: data.unitId,
          testType: data.testType,
          published: data.published,
        };
        metaRef.current = initial;
        setMeta(initial);
      })
      .catch((err) => {
        console.warn('[editor] could not load the test:', rawErrorText(err));
        setLoadFailed(true);
      });
    refreshVariants();
    teacherApi
      .listSessions(testId)
      .then(setSessions)
      .catch(() => undefined);
    // Units (T-018) — needed for the "tag this test to a Unit" dropdown below.
    teacherApi
      .listUnits()
      .then(setUnits)
      .catch(() => undefined);
  }, [testId, refreshVariants]);

  function buildMetaBody(value: MetaDraft): { body: UpdateTestRequest; hold: string | null } {
    if (value.title.trim() === '') throw new HoldSave(t('teacherTestEditor.hold.title'));
    const body: UpdateTestRequest = {
      title: value.title.trim(),
      unitId: value.unitId,
      testType: value.testType,
      published: value.published,
    };
    let hold: string | null = null;
    const trimmed = value.timeLimitText.trim();
    if (trimmed === '') {
      body.timeLimitMinutes = null;
    } else {
      const minutes = Number(trimmed);
      if (/^\d+$/.test(trimmed) && minutes >= 1 && minutes <= 480) body.timeLimitMinutes = minutes;
      else hold = t('teacherTestEditor.settings.timeLimitInvalid');
    }
    return { body, hold };
  }

  const metaSaver = useSerialSaver<MetaDraft>(
    'meta',
    async (value) => {
      const { body, hold } = buildMetaBody(value);
      await teacherApi.updateTest(testId, body);
      // The rest of the block is saved; only the half-typed time limit waits.
      if (hold) throw new HoldSave(hold);
    },
    {
      saveOnUnload: (value) => {
        try {
          sendKeepalive('PATCH', `/api/teacher/tests/${testId}`, buildMetaBody(value).body);
        } catch {
          // Not ready to save (held) — nothing to send.
        }
      },
    },
  );

  function updateMeta(patch: Partial<MetaDraft>, options: { immediate?: boolean; delayMs?: number } = {}) {
    if (!metaRef.current) return;
    const next = { ...metaRef.current, ...patch };
    metaRef.current = next;
    setMeta(next);
    metaSaver.schedule(next, options);
  }

  /** Runs one add / delete / reorder request in order, updating the page with its answer. */
  function runStructural(action: () => Promise<TestDetailDTO>) {
    async function perform() {
      tracker.report('structure', { state: 'saving' });
      try {
        setTest(await action());
        setActionError(null);
        tracker.report('structure', { state: 'idle', justSaved: true });
      } catch (err) {
        const message = friendlyEditorError(err, t);
        setActionError(message);
        tracker.report(
          'structure',
          { state: 'failed', message, detail: rawErrorText(err) },
          () => {
            structureQueue.current = structureQueue.current.then(perform);
          },
        );
      }
    }
    structureQueue.current = structureQueue.current.then(perform);
  }

  async function handleAddSection(event: React.FormEvent) {
    event.preventDefault();
    const sectionTitle = newSectionTitle.trim();
    if (!sectionTitle) return;
    setNewSectionTitle('');
    runStructural(() => teacherApi.createSection(testId, { title: sectionTitle }));
  }

  /** "Dựng khung 4 kỹ năng mẫu" (2026-09, IELTS mock-test support) — only offered for a
   * brand-new `mockTest` with zero sections yet (a convenience starting point, not a
   * requirement — a teacher can still add/rename/remove sections freely afterward).
   * Creates the 4 sections one at a time (this test-authoring API has no bulk-create),
   * chained inside ONE `runStructural` call so a mid-way failure still leaves whatever
   * sections were created before it (rather than silently discarding them) and the save
   * indicator only shows one in-flight action, not 4. */
  function handleScaffoldMockTest() {
    const titles = [
      t('teacherTestEditor.mockScaffold.listeningTitle'),
      t('teacherTestEditor.mockScaffold.readingTitle'),
      t('teacherTestEditor.mockScaffold.writingTitle'),
      t('teacherTestEditor.mockScaffold.speakingTitle'),
    ];
    runStructural(async () => {
      let latest: TestDetailDTO | null = null;
      for (const title of titles) {
        latest = await teacherApi.createSection(testId, { title });
      }
      return latest!;
    });
  }

  function handleDeleteSection(sectionId: string) {
    runStructural(() => teacherApi.deleteSection(testId, sectionId));
  }

  function handleMoveSection(sectionId: string, direction: 'up' | 'down') {
    if (!test) return;
    const ids = test.sections.map((s) => s.id);
    const index = ids.indexOf(sectionId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    runStructural(() => teacherApi.reorderSections(testId, { orderedSectionIds: ids }));
  }

  function handleAddQuestion(sectionId: string, type: QuestionType) {
    // Only "+ Trắc nghiệm" needs a reminder later (its default choices pre-mark A correct, and a
    // teacher who never looks again could ship the wrong answer) — see `freshQuestionIds` below.
    const beforeIds = new Set(
      test?.sections.find((s) => s.id === sectionId)?.questions.map((q) => q.id) ?? [],
    );
    runStructural(async () => {
      // `matching`'s "copy the previous question's choices" convenience needs each
      // sibling question's LATEST saved choices — this page's own `test` state is
      // deliberately NOT kept in sync with a plain content edit elsewhere in the editor
      // (see `handleSaveQuestion`'s doc comment: avoiding a flicker back to older state),
      // so it can be stale here (e.g. a teacher just retyped question 1's choices and
      // tabbed away, then immediately clicks "+ Ghép nối" for question 2). A fresh fetch
      // right before building the default sidesteps that staleness entirely.
      const body =
        type === 'matching'
          ? matchingQuestionBody((await teacherApi.getTest(testId)).sections.find((s) => s.id === sectionId)?.questions, t)
          : defaultQuestionBody(type, t);
      const updated = await teacherApi.createQuestion(testId, sectionId, body);
      if (type === 'multipleChoice') {
        const newId = updated.sections
          .find((s) => s.id === sectionId)
          ?.questions.map((q) => q.id)
          .find((id) => !beforeIds.has(id));
        if (newId) freshQuestionIds.current.add(newId);
      }
      return updated;
    });
  }

  async function handleSaveSection(sectionId: string, body: UpdateSectionRequest) {
    await teacherApi.updateSection(testId, sectionId, body);
  }

  async function handleSaveQuestion(sectionId: string, questionId: string, body: UpdateQuestionRequest) {
    // The answer is not applied to the page: the question keeps its own draft, and replacing
    // the whole test with a slightly older response could make a newer edit flicker back.
    await teacherApi.updateQuestion(testId, sectionId, questionId, body);
  }

  function handleSaveQuestionOnUnload(sectionId: string, questionId: string, body: UpdateQuestionRequest) {
    sendKeepalive('PATCH', `/api/teacher/tests/${testId}/sections/${sectionId}/questions/${questionId}`, body);
  }

  function handleDeleteQuestion(sectionId: string, questionId: string) {
    freshQuestionIds.current.delete(questionId);
    runStructural(() => teacherApi.deleteQuestion(testId, sectionId, questionId));
  }

  function handleMoveQuestion(sectionId: string, questionId: string, direction: 'up' | 'down') {
    const section = test?.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const ids = section.questions.map((q) => q.id);
    const index = ids.indexOf(questionId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    runStructural(() => teacherApi.reorderQuestions(testId, sectionId, { orderedQuestionIds: ids }));
  }

  async function handleRegenerateVariants() {
    if (
      variants.some((variant) => (variant.attemptCount ?? 0) > 0) &&
      !window.confirm(t('teacherTestEditor.variants.confirmRegenerate'))
    ) {
      return;
    }
    setIsRegeneratingVariants(true);
    setVariantNote(null);
    try {
      await tracker.flushAll();
      const result = await teacherApi.regenerateVariants(testId);
      setVariants(result.variants);
      setVariantNote({ tone: 'ok', text: t('teacherTestEditor.variants.regenerated') });
    } catch (err) {
      console.warn('[editor] regenerate variants failed:', rawErrorText(err));
      setVariantNote({ tone: 'error', text: friendlyEditorError(err, t) });
    } finally {
      setIsRegeneratingVariants(false);
    }
  }

  async function handleStartSession() {
    setIsStartingSession(true);
    setSessionError(null);
    try {
      await tracker.flushAll();
      const session = await teacherApi.startSession(testId);
      setCurrentSession(session);
      const all = await teacherApi.listSessions(testId);
      setSessions(all);
      refreshVariants();
    } catch (err) {
      console.warn('[editor] start session failed:', rawErrorText(err));
      setSessionError(friendlyEditorError(err, t));
    } finally {
      setIsStartingSession(false);
    }
  }

  async function handleCloseSession(sessionId: string) {
    try {
      await teacherApi.closeSession(sessionId);
      const all = await teacherApi.listSessions(testId);
      setSessions(all);
      if (currentSession?.id === sessionId) {
        setCurrentSession({ ...currentSession, status: 'closed' });
      }
    } catch (err) {
      console.warn('[editor] close session failed:', rawErrorText(err));
      setSessionError(friendlyEditorError(err, t));
    }
  }

  async function openPreview() {
    await tracker.flushAll();
    setShowPreview(true);
  }

  // Phase 16 "Nhân bản" (T-118): lets a teacher deep in editing THIS test duplicate it as a fresh
  // starting point (e.g. for a similar class) without going back to the list first. Flushes any
  // pending autosave first so the copy reflects exactly what's on screen, same as `openPreview`/
  // `openAssign` above, then jumps straight into the new copy's own editor.
  async function handleDuplicateTest() {
    setIsDuplicating(true);
    setActionError(null);
    try {
      await tracker.flushAll();
      const created = await teacherApi.duplicateTest(testId);
      navigate(`/teacher/tests/${created.id}`);
    } catch (err) {
      console.warn('[editor] duplicate test failed:', rawErrorText(err));
      setActionError(friendlyEditorError(err, t));
      setIsDuplicating(false);
    }
  }

  async function openAssign() {
    await tracker.flushAll();
    const staleCount = freshQuestionIds.current.size;
    if (staleCount > 0 && !window.confirm(t('teacherTestEditor.freshQuestionsWarning', { count: staleCount }))) {
      return;
    }
    setShowAssign(true);
  }

  if (!test || !meta) {
    return (
      <div>
        <LibraryBreadcrumb section="tests" linkSection />
        {loadFailed ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {t('teacherTestEditor.loadFailed')}
          </p>
        ) : (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  const questionCount = test.sections.reduce((sum, section) => sum + section.questions.length, 0);

  return (
    <div className="flex flex-col">
      <LibraryBreadcrumb section="tests" linkSection />
      <SaveStatusBar status={status} />

      <div className="mt-4">
        <input
          type="text"
          value={meta.title}
          onChange={(event) => updateMeta({ title: event.target.value })}
          onBlur={() => void metaSaver.flush()}
          aria-label={t('teacherTestEditor.titleAriaLabel')}
          className="w-full rounded-md border border-primary-200 px-3 py-2 text-2xl font-bold text-primary-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            {t('teacherTestEditor.settings.timeLimitLabel')}
            <input
              type="number"
              min={1}
              value={meta.timeLimitText}
              onChange={(event) => updateMeta({ timeLimitText: event.target.value }, { delayMs: NUMBER_DEBOUNCE_MS })}
              onBlur={() => void metaSaver.flush()}
              placeholder={t('teacherTestEditor.settings.timeLimitPlaceholder')}
              className="w-32 rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            {t('teacherTestEditor.settings.unitLabel')}
            <select
              value={meta.unitId ?? ''}
              onChange={(event) =>
                updateMeta({ unitId: event.target.value === '' ? null : event.target.value }, { immediate: true })
              }
              className={selectClass}
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
              value={meta.testType}
              onChange={(event) => updateMeta({ testType: event.target.value as TestType }, { immediate: true })}
              className={selectClass}
            >
              {TEST_TYPE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`teacherTestEditor.testTypes.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {meta.testType === 'unitTest' && (
            <label className="flex items-center gap-2 text-sm font-medium text-base-black">
              <input
                type="checkbox"
                checked={meta.published}
                onChange={(event) => updateMeta({ published: event.target.checked }, { immediate: true })}
                className="h-4 w-4 rounded border-primary-300 text-primary-600 focus:ring-primary-200"
              />
              {t('teacherTestEditor.settings.publishedLabel')}
            </label>
          )}
          {meta.testType === 'unitTest' && meta.unitId && (
            <Link
              to={`/units/${meta.unitId}/leaderboard`}
              className="text-sm font-medium text-primary-600 hover:underline"
            >
              {t('teacherTestEditor.settings.viewUnitLeaderboard')}
            </Link>
          )}
        </div>
        {actionError && (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </p>
        )}
      </div>

      <section
        aria-labelledby="next-step-heading"
        className="mt-6 flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50 p-4 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <h2 id="next-step-heading" className="text-base font-bold text-primary-700">
          {t('teacherTestEditor.nextStep.heading')}
        </h2>
        <span className="text-sm text-base-black/80">{t('teacherTestEditor.nextStep.question')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="hidden text-primary-700 sm:inline">
            →
          </span>
          <button
            type="button"
            onClick={() => void openPreview()}
            className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherTestEditor.nextStep.preview')}
          </button>
          <span aria-hidden="true" className="text-primary-700">
            →
          </span>
          <button
            type="button"
            onClick={() => void openAssign()}
            className="rounded-md bg-primary-500 px-4 py-2.5 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('teacherTestEditor.nextStep.assign')}
          </button>
          <button
            type="button"
            onClick={() => void handleDuplicateTest()}
            disabled={isDuplicating}
            aria-label={t('teacherTests.duplicateAriaLabel', { title: meta.title })}
            className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDuplicating ? t('teacherTests.duplicating') : t('teacherTestEditor.nextStep.duplicate')}
          </button>
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherTestEditor.sections.heading')}</h2>
        {test.sections.length === 0 && (
          <p className="text-sm text-base-black/60">{t('teacherTestEditor.sections.empty')}</p>
        )}
        {test.sections.map((section, sectionIndex) => (
          <TestSectionEditor
            key={section.id}
            testId={testId}
            section={section}
            index={sectionIndex}
            count={test.sections.length}
            onMove={(direction) => handleMoveSection(section.id, direction)}
            onDelete={() => handleDeleteSection(section.id)}
            onAddQuestion={(type) => handleAddQuestion(section.id, type)}
            onSaveSection={handleSaveSection}
            onSaveQuestion={(questionId, body) => handleSaveQuestion(section.id, questionId, body)}
            onSaveQuestionOnUnload={(questionId, body) => handleSaveQuestionOnUnload(section.id, questionId, body)}
            onDeleteQuestion={(questionId) => handleDeleteQuestion(section.id, questionId)}
            onMoveQuestion={(questionId, direction) => handleMoveQuestion(section.id, questionId, direction)}
            isQuestionFreshDefault={isQuestionFreshDefault}
            onQuestionFirstEdit={onQuestionFirstEdit}
          />
        ))}

        {meta.testType === 'mockTest' && test.sections.length === 0 && (
          <div className="rounded-md border border-primary-200 bg-primary-50 p-4">
            <p className="text-sm text-base-black/70">{t('teacherTestEditor.mockScaffold.hint')}</p>
            <button
              type="button"
              onClick={handleScaffoldMockTest}
              className="mt-2 rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
            >
              {t('teacherTestEditor.mockScaffold.button')}
            </button>
          </div>
        )}

        <form onSubmit={handleAddSection} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            {t('teacherTestEditor.sections.newSectionTitleLabel')}
            <input
              type="text"
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.target.value)}
              placeholder={t('teacherTestEditor.sections.newSectionTitlePlaceholder')}
              className="w-64 max-w-full rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            disabled={!newSectionTitle.trim()}
            className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('teacherTestEditor.sections.addSection')}
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherTestEditor.variants.heading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherTestEditor.variants.description')}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {variants.map((variant) => (
            <li
              key={variant.id}
              className="rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
            >
              {t('teacherTestEditor.variants.code', { code: variant.code })}
            </li>
          ))}
        </ul>
        {variants.length === 0 && (
          <p className="mt-3 text-sm text-base-black/60">{t('teacherTestEditor.variants.empty')}</p>
        )}
        <button
          type="button"
          onClick={() => void handleRegenerateVariants()}
          disabled={isRegeneratingVariants || questionCount === 0}
          className="mt-3 rounded-md border border-primary-300 bg-base-white px-3 py-2.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 sm:py-1.5"
        >
          {isRegeneratingVariants
            ? t('teacherTestEditor.variants.regenerating')
            : t('teacherTestEditor.variants.regenerate')}
        </button>
        {variantNote && (
          <p
            role={variantNote.tone === 'error' ? 'alert' : 'status'}
            className={`mt-2 text-sm ${variantNote.tone === 'error' ? 'text-red-700' : 'text-green-800'}`}
          >
            {variantNote.text}
          </p>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherTestEditor.sessions.heading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherTestEditor.sessions.description')}</p>
        <button
          type="button"
          onClick={handleStartSession}
          disabled={isStartingSession}
          className="mt-3 rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="flex flex-col gap-2 rounded-md border border-primary-100 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
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
              <span className="flex flex-wrap items-center gap-x-3">
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${session.id}/live`)}
                  className="py-3 text-xs font-medium text-primary-600 hover:underline sm:py-0"
                >
                  {t('teacherTestEditor.sessions.liveMonitor')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${session.id}/attempts`)}
                  className="py-3 text-xs font-medium text-primary-600 hover:underline sm:py-0"
                >
                  {t('teacherTestEditor.sessions.viewAttempts')}
                </button>
                {session.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleCloseSession(session.id)}
                    className="rounded px-2 py-3 sm:py-1 text-xs font-medium text-red-600 hover:bg-red-50"
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

      {showPreview && <TestPreviewModal testId={testId} onClose={() => setShowPreview(false)} />}
      {showAssign && (
        <AssignTestToClassesDialog
          testId={testId}
          testTitle={meta.title}
          questionCount={questionCount}
          onClose={() => {
            setShowAssign(false);
            refreshVariants();
          }}
        />
      )}
    </div>
  );
}

export default TeacherTestEditorPage;
