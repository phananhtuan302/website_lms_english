import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  CreateSessionResponse,
  QuestionType,
  SectionDTO,
  TestDetailDTO,
  TestSessionDTO,
  TestVariantDTO,
  UnitDTO,
  UpdateQuestionRequest,
  UpdateSectionRequest,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import QuestionEditor from '../components/QuestionEditor';

/** Default shape for a brand-new question of a given type — a sensible, editable
 * starting point rather than an empty/invalid one, so it saves successfully right away. */
function defaultQuestionBody(type: QuestionType): {
  type: QuestionType;
  prompt: string;
  choices?: { text: string; isCorrect: boolean }[];
  acceptedAnswers?: string[];
  essayMaxScore?: number;
} {
  if (type === 'trueFalse') {
    return {
      type,
      prompt: 'New true/false question',
      choices: [
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false },
      ],
    };
  }
  if (type === 'fillBlank') {
    return { type, prompt: 'New fill-in-the-blank question', acceptedAnswers: ['answer'] };
  }
  if (type === 'essay') {
    return { type, prompt: 'New essay question', essayMaxScore: 10 };
  }
  return {
    type,
    prompt: 'New multiple-choice question',
    choices: [
      { text: 'Option A', isCorrect: true },
      { text: 'Option B', isCorrect: false },
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
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load test.'));
  }, [testId]);

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
      setError(err instanceof ApiError ? err.message : 'Failed to save title.');
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
      setError('Time limit must be a whole number of minutes, or left blank for no limit.');
      setTimeLimitText(test.timeLimitMinutes != null ? String(test.timeLimitMinutes) : '');
      return;
    }
    try {
      const updated = await teacherApi.updateTest(testId!, { title: test.title, timeLimitMinutes });
      setTest(updated);
      setTimeLimitText(updated.timeLimitMinutes != null ? String(updated.timeLimitMinutes) : '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save time limit.');
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
      setError(err instanceof ApiError ? err.message : 'Failed to save unit tag.');
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
      setError(err instanceof ApiError ? err.message : 'Failed to add section.');
    }
  }

  async function handleSectionTitleBlur(sectionId: string, value: string, previous: string) {
    if (value.trim() === '' || value === previous) return;
    try {
      const updated = await teacherApi.updateSection(testId!, sectionId, { title: value.trim() });
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save section title.');
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
      setError(err instanceof ApiError ? err.message : 'Failed to save section content.');
    }
  }

  async function handleDeleteSection(sectionId: string) {
    try {
      const updated = await teacherApi.deleteSection(testId!, sectionId);
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete section.');
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
      setError(err instanceof ApiError ? err.message : 'Failed to reorder sections.');
    }
  }

  async function handleAddQuestion(sectionId: string, type: QuestionType) {
    try {
      const updated = await teacherApi.createQuestion(
        testId!,
        sectionId,
        defaultQuestionBody(type),
      );
      setTest(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add question.');
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
      setError(err instanceof ApiError ? err.message : 'Failed to delete question.');
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
      setError(err instanceof ApiError ? err.message : 'Failed to reorder questions.');
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
      setVariantError(err instanceof ApiError ? err.message : 'Failed to generate variants.');
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
      setSessionError(err instanceof ApiError ? err.message : 'Failed to start session.');
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
      setSessionError(err instanceof ApiError ? err.message : 'Failed to close session.');
    }
  }

  if (!test) {
    return (
      <div>
        <Link to="/teacher/tests" className="text-sm text-primary-600 hover:underline">
          ← Back to my tests
        </Link>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-base-black/60">Loading...</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to="/teacher/tests" className="text-sm text-primary-600 hover:underline">
          ← Back to my tests
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
            Time limit (minutes, optional)
            <input
              type="number"
              min={1}
              value={timeLimitText}
              onChange={(event) => setTimeLimitText(event.target.value)}
              onBlur={handleSaveTimeLimit}
              placeholder="No limit"
              className="w-32 rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            Unit (optional, T-018)
            <select
              value={test.unitId ?? ''}
              onChange={(event) =>
                handleSaveUnit(event.target.value === '' ? null : event.target.value)
              }
              className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">No unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-base-black">Sections &amp; questions</h2>
        {test.sections.length === 0 && (
          <p className="text-sm text-base-black/60">No sections yet — add one below.</p>
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
                  aria-label="Move section up"
                  className="rounded px-2 py-1 text-xs text-base-black/60 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveSection(section.id, 'down')}
                  disabled={sectionIndex === test.sections.length - 1}
                  aria-label="Move section down"
                  className="rounded px-2 py-1 text-xs text-base-black/60 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSection(section.id)}
                  className="ml-2 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete section
                </button>
              </div>
            </div>

            <details className="mt-3 rounded-lg border border-primary-100 bg-base-white p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-primary-600">
                Reading passage / Listening audio (optional)
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black sm:col-span-2">
                  Passage text (T-039)
                  <textarea
                    defaultValue={section.passageText ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, { passageText: event.target.value || null })
                    }
                    rows={3}
                    placeholder="Paste the reading passage here — shown to students above this section's questions."
                    className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                  Passage image URL (optional)
                  <input
                    type="text"
                    defaultValue={section.passageImageUrl ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, { passageImageUrl: event.target.value || null })
                    }
                    placeholder="https://..."
                    className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                  Audio URL (T-040/T-041, placeholder convention like flashcard audio)
                  <input
                    type="text"
                    defaultValue={section.audioUrl ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, { audioUrl: event.target.value || null })
                    }
                    placeholder="https://..."
                    className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                  Max plays for home self-practice (blank = unlimited)
                  <input
                    type="number"
                    min={1}
                    defaultValue={section.maxPlayCount ?? ''}
                    onBlur={(event) =>
                      handleUpdateSectionContent(section, {
                        maxPlayCount: event.target.value.trim() === '' ? null : Number(event.target.value),
                      })
                    }
                    placeholder="Unlimited"
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
                + Multiple choice
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'trueFalse')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                + True/False
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'fillBlank')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                + Fill in the blank
              </button>
              <button
                type="button"
                onClick={() => handleAddQuestion(section.id, 'essay')}
                className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
              >
                + Essay (Writing)
              </button>
            </div>
          </div>
        ))}

        <form onSubmit={handleAddSection} className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
            New section title
            <input
              type="text"
              value={newSectionTitle}
              onChange={(event) => setNewSectionTitle(event.target.value)}
              placeholder="e.g. Reading Comprehension"
              className="w-64 rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </label>
          <button
            type="submit"
            disabled={!newSectionTitle.trim()}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add section
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">Test variants ("mã đề")</h2>
        <p className="mt-1 text-sm text-base-black/60">
          Each variant shuffles question order (within each section) and choice order (within each
          question) while keeping the correct answer for every question intact.
        </p>
        <button
          type="button"
          onClick={handleGenerateVariants}
          disabled={isGeneratingVariants}
          className="mt-3 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGeneratingVariants ? 'Generating...' : 'Generate 2 more variants'}
        </button>
        {variantError && <p className="mt-2 text-sm text-red-700">{variantError}</p>}
        <ul className="mt-4 flex flex-wrap gap-2">
          {variants.map((variant) => (
            <li
              key={variant.id}
              className="rounded-full bg-primary-100 px-4 py-1.5 text-sm font-semibold text-primary-700"
            >
              Mã đề {variant.code}
            </li>
          ))}
          {variants.length === 0 && (
            <p className="text-sm text-base-black/60">No variants generated yet.</p>
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">QR join sessions</h2>
        <p className="mt-1 text-sm text-base-black/60">
          Starting a new session automatically closes any previous active session for this test.
        </p>
        <button
          type="button"
          onClick={handleStartSession}
          disabled={isStartingSession}
          className="mt-3 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStartingSession ? 'Starting...' : 'Start new session'}
        </button>
        {sessionError && <p className="mt-2 text-sm text-red-700">{sessionError}</p>}

        {currentSession && (
          <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4 sm:flex-row sm:items-center">
            <img
              src={currentSession.qrCodeDataUrl}
              alt={`QR code to join ${test.title}`}
              className="h-40 w-40 rounded-md border border-primary-200 bg-base-white p-2"
            />
            <div>
              <p className="text-sm text-base-black/70">Scan the QR code, or use the join link:</p>
              <p className="mt-1 break-all font-mono text-sm text-primary-700">
                {currentSession.joinUrl}
              </p>
              <p className="mt-2 text-sm text-base-black/70">
                Manual fallback code:{' '}
                <span className="font-mono text-lg font-bold tracking-widest text-primary-700">
                  {currentSession.manualCode}
                </span>
              </p>
              <p className="mt-1 text-xs uppercase text-base-black/50">
                Status: {currentSession.status}
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
                Code <span className="font-mono font-semibold">{session.manualCode}</span> ·{' '}
                <span
                  className={session.status === 'active' ? 'text-green-700' : 'text-base-black/50'}
                >
                  {session.status}
                </span>{' '}
                · started {new Date(session.createdAt).toLocaleString()}
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${session.id}/live`)}
                  className="text-xs font-medium text-primary-600 hover:underline"
                >
                  Live monitor
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/teacher/sessions/${session.id}/attempts`)}
                  className="text-xs font-medium text-primary-600 hover:underline"
                >
                  View attempts
                </button>
                {session.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleCloseSession(session.id)}
                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Close
                  </button>
                )}
              </span>
            </li>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-base-black/60">No sessions started yet.</p>
          )}
        </ul>
      </section>
    </div>
  );
}

export default TeacherTestEditorPage;
