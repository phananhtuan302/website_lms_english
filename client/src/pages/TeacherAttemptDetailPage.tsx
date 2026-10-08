import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IELTS_BAND_MAX, SPEAKING_SCORE_SCALE, type AttemptResultDTO, type AttemptSiblingsDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { CLASSES_HOME_PATH, classTabPath } from '../lib/classWorkspace';
import { formatPoints, formatScore10 } from '../lib/scoreFormat';
import AiFeedbackSections from '../components/AiFeedbackSections';

/** Local draft state for one essay/speaking question's manual-grading form (T-042
 * essay, T-055 speaking override) — kept separate from `result` so an in-progress edit
 * doesn't get clobbered by a re-render, same "own local draft, save on explicit action"
 * pattern as `QuestionEditor.tsx`. */
interface GradeDraft {
  scoreText: string;
  comment: string;
  /** Only meaningful for an essay question with `essayUseIeltsCriteria` (2026-09) — 4
   * separate 0-9 band scores instead of one free-form `scoreText`. */
  taskScoreText: string;
  coherenceScoreText: string;
  lexicalScoreText: string;
  grammarScoreText: string;
}

function emptyGradeDraft(): GradeDraft {
  return { scoreText: '', comment: '', taskScoreText: '', coherenceScoreText: '', lexicalScoreText: '', grammarScoreText: '' };
}

/** A typed score: a Vietnamese teacher writes "4,5" as often as "4.5", so both are accepted.
 * Returns `null` for anything that is not a plain number. */
function parseScoreInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** A valid IELTS band score: 0-9 in 0.5 steps — same rule the server enforces, checked
 * here too so the teacher sees a clear error before the request round-trip. */
function parseBandScoreInput(text: string): number | null {
  const value = parseScoreInput(text);
  if (value === null || value < 0 || value > IELTS_BAND_MAX) return null;
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9 ? value : null;
}

/** Formats the teacher's own score if graded, else the AI's suggestion, else '' —
 * the shared pre-fill rule for the essay grading form's score inputs (2026-09). */
function formatBandFallback(manual: number | null, ai: number | null): string {
  if (manual != null) return formatPoints(manual);
  if (ai != null) return formatPoints(ai);
  return '';
}

const SCORE_INPUT_CLASS =
  'w-28 rounded-md border border-primary-200 px-3 py-2 text-base text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:py-1.5 sm:text-sm';
const COMMENT_INPUT_CLASS =
  'w-full rounded-md border border-primary-200 px-3 py-2 text-base text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:text-sm';
const SAVE_BUTTON_CLASS =
  'rounded-md border border-primary-300 bg-base-white px-4 py-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2';
const SAVE_NEXT_BUTTON_CLASS =
  'rounded-md bg-primary-500 px-4 py-3 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2';

/**
 * Teacher's per-attempt detail (T-014), reachable at `/teacher/attempts/:attemptId`
 * from `TeacherSessionAttemptsPage`. Reuses the exact same `AttemptResultDTO` shape as
 * the student's own result page — see `server/src/lib/attemptView.ts` — since a
 * per-question correct/incorrect breakdown means the same thing to both audiences; only
 * the ownership check differs (teacher must own the test, enforced server-side).
 *
 * Extended by T-042 (manual essay grading — score + comment form per essay question),
 * T-044 (a tab-switch summary banner, since this is also where a teacher reviews
 * integrity signals for one attempt after the fact), and T-055 (Speaking playback + AI
 * score/feedback review, with the same manual-override form reused for speaking).
 */
function TeacherAttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  // Keyed by the attempt: "Lưu và chấm bài kế tiếp" moves to another attempt of the SAME test, whose
  // questions have the same ids, so every draft / message of the previous student must be dropped.
  return <AttemptDetail key={attemptId} attemptId={attemptId} />;
}

function AttemptDetail({ attemptId }: { attemptId: string | undefined }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [result, setResult] = useState<AttemptResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const [gradingErrors, setGradingErrors] = useState<Record<string, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  // Green "Đã lưu điểm của …" line per question; a page reached from "Lưu và chấm bài kế tiếp"
  // carries the previous student's line in the navigation state.
  const [savedMessages, setSavedMessages] = useState<Record<string, string>>({});
  const [arrivalNotice] = useState<string | null>(
    () => (location.state as { savedNotice?: string } | null)?.savedNotice ?? null,
  );
  // Phase 17 (T-118B): set when "Lưu và chấm bài kế tiếp" moved the teacher into a DIFFERENT
  // class than the one they were just grading — a small "Đã chuyển sang lớp …" notice.
  const [crossedIntoClassName] = useState<string | null>(
    () => (location.state as { crossedIntoClassName?: string } | null)?.crossedIntoClassName ?? null,
  );
  // Set when the last ungraded essay of the class was just saved: where "Về trang lớp" leads.
  const [allDone, setAllDone] = useState<{ classId: string | null; savedLine: string } | null>(null);
  // "Học sinh {{position}}/{{total}}" + prev/next — every submitted attempt of this test/class,
  // graded or not (T-114/T-115 round 2: "không có nút quay lại em trước khi đang chấm").
  const [siblings, setSiblings] = useState<AttemptSiblingsDTO | null>(null);

  const loadResult = useCallback(() => {
    if (!attemptId) return;
    teacherApi
      .getAttemptDetail(attemptId)
      .then((data) => {
        setResult(data);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const q of data.questions) {
            if (q.type === 'essay' && !next[q.questionId]) {
              // Pre-fills from the teacher's own grade if one exists, else the AI's
              // suggestion (2026-09) — same "adjust this number" starting-point
              // convenience Speaking's override already used, now extended to essay.
              next[q.questionId] = {
                ...emptyGradeDraft(),
                scoreText: formatBandFallback(q.manualScore, q.essayAiScore),
                comment: q.manualComment ?? '',
                taskScoreText: formatBandFallback(q.essayIeltsTaskScore, q.essayAiTaskScore),
                coherenceScoreText: formatBandFallback(q.essayIeltsCoherenceScore, q.essayAiCoherenceScore),
                lexicalScoreText: formatBandFallback(q.essayIeltsLexicalScore, q.essayAiLexicalScore),
                grammarScoreText: formatBandFallback(q.essayIeltsGrammarScore, q.essayAiGrammarScore),
              };
            }
            if (q.type === 'speaking' && !next[q.questionId]) {
              // Pre-fills the score with the AI (Mock) grade as a starting point for
              // override (T-055) — documented choice: overriding reads as "adjust this
              // number" rather than "type a score from nothing," since the AI verdict
              // is already right there to compare against. The comment stays blank
              // (not pre-filled from `speakingAiFeedback`) so a saved `manualComment`
              // always reflects something the teacher actually wrote.
              next[q.questionId] = {
                ...emptyGradeDraft(),
                scoreText:
                  q.manualScore != null
                    ? formatPoints(q.manualScore)
                    : q.speakingAiScore != null
                      ? formatPoints(q.speakingAiScore)
                      : '',
                comment: q.manualComment ?? '',
              };
            }
          }
          return next;
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherAttemptDetail.loadFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  useEffect(loadResult, [loadResult]);

  useEffect(() => {
    if (!attemptId) return;
    setSiblings(null);
    teacherApi.getAttemptSiblings(attemptId).then(setSiblings).catch(() => setSiblings(null));
  }, [attemptId]);

  function updateDraft(questionId: string, patch: Partial<GradeDraft>) {
    setDrafts((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] ?? emptyGradeDraft()), ...patch } }));
  }

  /** Shared tail of both save handlers below — updates the header total/chip and this
   * question's stored grade from the response, in place, no reload; then advances to the
   * next ungraded essay ("Lưu và chấm bài kế tiếp") exactly the same way either grading
   * mode does it. */
  async function afterGradeSaved(
    questionId: string,
    saved: Awaited<ReturnType<typeof teacherApi.gradeEssayAnswer>>,
    savedLine: string,
    goNext: boolean,
  ) {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            scorePercent: saved.scorePercent,
            provisional: saved.provisional,
            ungradedCount: saved.ungradedCount,
            questions: prev.questions.map((q) =>
              q.questionId === questionId
                ? {
                    ...q,
                    manualScore: saved.manualScore,
                    manualComment: saved.manualComment,
                    essayIeltsTaskScore: saved.ieltsCriteria?.taskScore ?? null,
                    essayIeltsCoherenceScore: saved.ieltsCriteria?.coherenceScore ?? null,
                    essayIeltsLexicalScore: saved.ieltsCriteria?.lexicalScore ?? null,
                    essayIeltsGrammarScore: saved.ieltsCriteria?.grammarScore ?? null,
                  }
                : q,
            ),
          }
        : prev,
    );

    if (!goNext) {
      setSavedMessages((prev) => ({ ...prev, [questionId]: savedLine }));
      return;
    }
    if (saved.ungradedCount > 0) {
      // Another essay of THIS attempt is still waiting — finish it before moving on.
      setSavedMessages((prev) => ({
        ...prev,
        [questionId]: `${savedLine} ${t('scoring.grade.moreInThisAttempt', { count: saved.ungradedCount })}`,
      }));
      return;
    }
    try {
      const next = await teacherApi.getNextUngradedAttempt(attemptId!);
      if (next.nextAttemptId) {
        // `replace`: the back button still returns to the list, not through every student graded.
        navigate(`/teacher/attempts/${next.nextAttemptId}`, {
          replace: true,
          state: { savedNotice: savedLine, crossedIntoClassName: next.crossedIntoClassName ?? null },
        });
      } else {
        setSavedMessages((prev) => ({ ...prev, [questionId]: savedLine }));
        setAllDone({ classId: next.classId, savedLine });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      setSavedMessages((prev) => ({ ...prev, [questionId]: `${savedLine} ${t('scoring.grade.nextFailed')}` }));
    }
  }

  /** Save path for an essay with `essayUseIeltsCriteria` (2026-09) — 4 band scores
   * instead of one free-form score; the server computes the overall `manualScore` itself
   * (their average, rounded to the nearest 0.5), so this only has to validate each is a
   * real 0-9 band score before sending. */
  async function handleSaveIeltsGrade(questionId: string, goNext = false) {
    if (!attemptId || !result) return;
    const draft = drafts[questionId] ?? emptyGradeDraft();
    const taskScore = parseBandScoreInput(draft.taskScoreText);
    const coherenceScore = parseBandScoreInput(draft.coherenceScoreText);
    const lexicalScore = parseBandScoreInput(draft.lexicalScoreText);
    const grammarScore = parseBandScoreInput(draft.grammarScoreText);
    if (taskScore === null || coherenceScore === null || lexicalScore === null || grammarScore === null) {
      setGradingErrors((prev) => ({ ...prev, [questionId]: t('scoring.grade.ieltsCriteriaInvalid', { max: IELTS_BAND_MAX }) }));
      setSavedMessages((prev) => ({ ...prev, [questionId]: '' }));
      return;
    }
    setSavingQuestionId(questionId);
    setGradingErrors((prev) => ({ ...prev, [questionId]: '' }));
    setSavedMessages((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const saved = await teacherApi.gradeEssayAnswer(attemptId, questionId, {
        ieltsCriteria: { taskScore, coherenceScore, lexicalScore, grammarScore },
        comment: draft.comment.trim() === '' ? null : draft.comment,
      });
      const savedLine = t('scoring.grade.savedIelts', { name: result.studentName, score: formatPoints(saved.manualScore) });
      await afterGradeSaved(questionId, saved, savedLine, goNext);
    } catch (err) {
      setGradingErrors((prev) => ({
        ...prev,
        [questionId]: err instanceof ApiError ? err.message : t('teacherAttemptDetail.saveGradeFailed'),
      }));
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function handleSaveGrade(questionId: string, maxScore: number | null, goNext = false) {
    if (!attemptId || !result) return;
    const max = maxScore ?? 0;
    const draft = drafts[questionId];
    const scoreText = draft?.scoreText ?? '';
    const score = parseScoreInput(scoreText);
    let problem: string | null = null;
    if (scoreText.trim() === '') problem = t('scoring.grade.scoreEmpty', { max: formatPoints(max) });
    else if (score === null) problem = t('scoring.grade.scoreInvalid');
    else if (score > max) problem = t('scoring.grade.scoreRange', { max: formatPoints(max) });
    if (problem !== null || score === null) {
      setGradingErrors((prev) => ({ ...prev, [questionId]: problem ?? '' }));
      setSavedMessages((prev) => ({ ...prev, [questionId]: '' }));
      return;
    }
    setSavingQuestionId(questionId);
    setGradingErrors((prev) => ({ ...prev, [questionId]: '' }));
    setSavedMessages((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const saved = await teacherApi.gradeEssayAnswer(attemptId, questionId, {
        score,
        comment: draft.comment.trim() === '' ? null : draft.comment,
      });
      const savedLine = t('scoring.grade.saved', {
        name: result.studentName,
        score: formatPoints(saved.manualScore),
        max: formatPoints(max),
      });
      await afterGradeSaved(questionId, saved, savedLine, goNext);
    } catch (err) {
      setGradingErrors((prev) => ({
        ...prev,
        [questionId]: err instanceof ApiError ? err.message : t('teacherAttemptDetail.saveGradeFailed'),
      }));
    } finally {
      setSavingQuestionId(null);
    }
  }

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!result) {
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <button
        type="button"
        onClick={() => {
          // T-103: back returns to wherever the teacher came from (a class's results page, the
          // gradebook, a session's attempt list, ...). A `default` key means this page was the
          // first entry in the tab's history (opened from a bookmark / new tab), where
          // `navigate(-1)` would leave the app — fall back to this test's report instead.
          if (location.key !== 'default') navigate(-1);
          else navigate(`/teacher/tests/${encodeURIComponent(result.testId)}/report`);
        }}
        className="self-start py-2.5 text-sm text-primary-600 hover:underline sm:py-0"
      >
        {t('classAssignments.back')}
      </button>

      {arrivalNotice && !allDone && (
        <p role="status" aria-live="polite" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          {arrivalNotice}
        </p>
      )}
      {crossedIntoClassName && !allDone && (
        <p role="status" aria-live="polite" className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-800">
          {t('scoring.grade.crossedIntoClass', { className: crossedIntoClassName })}
        </p>
      )}
      {allDone && (
        <div role="status" aria-live="polite" className="rounded-xl border border-green-300 bg-green-50 p-6 text-center">
          <p className="text-lg font-bold text-green-800">{t('scoring.grade.allDoneAllClassesTitle')}</p>
          <p className="mt-1 text-sm text-green-900/80">{t('scoring.grade.allDoneAllClassesHint')}</p>
          <p className="mt-2 text-sm font-medium text-green-900">{allDone.savedLine}</p>
          <Link
            to={allDone.classId ? classTabPath(allDone.classId) : CLASSES_HOME_PATH}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary-500 px-5 py-3 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('scoring.grade.backToClass')}
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
        <h1 className="text-xl font-bold text-primary-700">{result.testTitle}</h1>
        <p className="mt-1 text-sm text-base-black/70">{result.studentName}</p>
        {result.status === 'submitted' ? (
          <>
            <p className="mt-2 text-4xl font-bold text-primary-700" data-testid="attempt-score">
              {t('scoring.detail.headline', { score: formatScore10(result.scorePercent) })}
            </p>
            {/* Live region: the chip vanishes the moment the last essay is graded. */}
            <div aria-live="polite">
              {result.provisional && (
                <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">
                  {t('scoring.provisional.chip', { count: result.ungradedCount })}
                </p>
              )}
            </div>
            <p className="mt-1 text-sm text-base-black/70">
              {t('teacherAttemptDetail.correctOutOf', { correct: result.correctCount, total: result.totalCount })}
            </p>
            {result.timeTakenSeconds !== null && (
              <p className="mt-1 text-xs text-base-black/50">
                {t('teacherAttemptDetail.timeTaken', {
                  time: `${Math.floor(result.timeTakenSeconds / 60)}:${String(result.timeTakenSeconds % 60).padStart(2, '0')}`,
                })}
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-lg font-semibold text-base-black/60">{t('teacherAttemptDetail.stillInProgress')}</p>
        )}
      </div>

      {siblings && siblings.total > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            disabled={!siblings.prevAttemptId}
            onClick={() =>
              siblings.prevAttemptId &&
              navigate(`/teacher/attempts/${siblings.prevAttemptId}`, { replace: true })
            }
            className="rounded-md border border-primary-300 bg-base-white px-3 py-3 font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5"
          >
            {t('scoring.grade.prevStudent')}
          </button>
          <span className="font-medium text-base-black/70">
            {t('scoring.grade.studentPosition', { position: siblings.position, total: siblings.total })}
          </span>
          <button
            type="button"
            disabled={!siblings.nextAttemptId}
            onClick={() =>
              siblings.nextAttemptId &&
              navigate(`/teacher/attempts/${siblings.nextAttemptId}`, { replace: true })
            }
            className="rounded-md border border-primary-300 bg-base-white px-3 py-3 font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5"
          >
            {t('scoring.grade.nextStudent')}
          </button>
        </div>
      )}

      {/* Global tab-switch / exit detection (T-044) — visible to the teacher after the
          fact, recorded once by the shared take-test runtime for every test type. */}
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          result.tabSwitchCount > 0
            ? 'border-red-200 bg-red-50 text-red-800'
            : 'border-primary-100 bg-base-white text-base-black/60'
        }`}
      >
        {result.tabSwitchCount > 0 ? (
          <>
            <p className="font-semibold">
              {t('teacherAttemptDetail.tabSwitchDetected', { count: result.tabSwitchCount })}
            </p>
            <p className="mt-1 text-xs text-red-700/80">
              {result.tabSwitchLog.map((ts) => new Date(ts).toLocaleTimeString()).join(', ')}
            </p>
          </>
        ) : (
          <p>{t('teacherAttemptDetail.noTabSwitches')}</p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">{t('teacherAttemptDetail.questionReview')}</h2>
        {result.questions.map((q) => (
          <div
            key={q.questionId}
            className={`rounded-lg border p-4 ${
              q.isCorrect === null
                ? 'border-primary-100 bg-base-white'
                : q.isCorrect
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-base-black">
                {t('teacherAttemptDetail.questionNumber', { order: q.order })} {q.prompt}
              </p>
              {q.type === 'essay' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {q.manualScore != null
                    ? `${formatPoints(q.manualScore)} / ${formatPoints(q.essayMaxScore ?? 0)}`
                    : q.essayAiScore != null
                      ? t('teacherAttemptDetail.essayScoreAi', { score: formatPoints(q.essayAiScore), max: formatPoints(q.essayMaxScore ?? 0) })
                      : t('teacherAttemptDetail.notGradedYet')}
                </span>
              ) : q.type === 'speaking' ? (
                <span className="shrink-0 rounded-full bg-primary-200 px-3 py-1 text-xs font-bold uppercase text-primary-800">
                  {q.manualScore != null
                    ? t('teacherAttemptDetail.speakingScoreTeacher', { score: q.manualScore, scale: SPEAKING_SCORE_SCALE })
                    : q.speakingAiScore != null
                      ? t('teacherAttemptDetail.speakingScoreAi', { score: q.speakingAiScore, scale: SPEAKING_SCORE_SCALE })
                      : t('teacherAttemptDetail.notSubmittedYet')}
                </span>
              ) : (
                q.isCorrect !== null && (
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${
                      q.isCorrect ? 'bg-green-600 text-base-white' : 'bg-red-600 text-base-white'
                    }`}
                  >
                    {q.isCorrect ? t('teacherAttemptDetail.correct') : t('teacherAttemptDetail.incorrect')}
                  </span>
                )
              )}
            </div>

            {q.type === 'essay' ? (
              <div className="mt-2 flex flex-col gap-3 text-sm text-base-black/80">
                <div className="whitespace-pre-wrap rounded-md border border-primary-100 bg-base-white p-3">
                  {q.textAnswer?.trim() ? q.textAnswer : <em>{t('teacherAttemptDetail.noAnswerSubmitted')}</em>}
                </div>
                {q.essayAiFeedback && (
                  <div className="rounded-md border border-primary-100 bg-primary-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                      {t('common.aiNote')}
                    </p>
                    {q.essayUseIeltsCriteria && (
                      <p className="mt-1 text-xs text-base-black/70">
                        {t('teacherAttemptDetail.aiIeltsTaskLabel', { score: formatPoints(q.essayAiTaskScore ?? 0) })}
                        {' · '}
                        {t('teacherAttemptDetail.aiIeltsCoherenceLabel', { score: formatPoints(q.essayAiCoherenceScore ?? 0) })}
                        {' · '}
                        {t('teacherAttemptDetail.aiIeltsLexicalLabel', { score: formatPoints(q.essayAiLexicalScore ?? 0) })}
                        {' · '}
                        {t('teacherAttemptDetail.aiIeltsGrammarLabel', { score: formatPoints(q.essayAiGrammarScore ?? 0) })}
                      </p>
                    )}
                    <AiFeedbackSections feedback={q.essayAiFeedback} className="mt-1" />
                  </div>
                )}
                <div className="flex flex-col gap-3 rounded-md border border-primary-100 bg-primary-50 p-3">
                  {q.essayUseIeltsCriteria ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ['taskScoreText', 'teacherAttemptDetail.ieltsTaskLabel'],
                          ['coherenceScoreText', 'teacherAttemptDetail.ieltsCoherenceLabel'],
                          ['lexicalScoreText', 'teacherAttemptDetail.ieltsLexicalLabel'],
                          ['grammarScoreText', 'teacherAttemptDetail.ieltsGrammarLabel'],
                        ] as const
                      ).map(([field, labelKey]) => (
                        <label key={field} className="flex flex-col gap-1 text-sm font-medium text-base-black">
                          {t(labelKey)}
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={drafts[q.questionId]?.[field] ?? ''}
                            onChange={(event) => updateDraft(q.questionId, { [field]: event.target.value })}
                            placeholder={t('teacherAttemptDetail.ieltsBandPlaceholder', { max: IELTS_BAND_MAX })}
                            className={SCORE_INPUT_CLASS}
                          />
                        </label>
                      ))}
                      {(() => {
                        const draft = drafts[q.questionId];
                        const scores = [
                          parseBandScoreInput(draft?.taskScoreText ?? ''),
                          parseBandScoreInput(draft?.coherenceScoreText ?? ''),
                          parseBandScoreInput(draft?.lexicalScoreText ?? ''),
                          parseBandScoreInput(draft?.grammarScoreText ?? ''),
                        ];
                        if (scores.some((s) => s === null)) return null;
                        const average = Math.round(((scores as number[]).reduce((a, b) => a + b, 0) / 4) * 2) / 2;
                        return (
                          <p className="text-sm font-semibold text-primary-700 sm:col-span-2">
                            {t('teacherAttemptDetail.ieltsAveragePreview', { average: formatPoints(average) })}
                          </p>
                        );
                      })()}
                    </div>
                  ) : (
                    <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                      {t('teacherAttemptDetail.scoreOutOf', { max: formatPoints(q.essayMaxScore ?? 0) })}
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={drafts[q.questionId]?.scoreText ?? ''}
                        onChange={(event) => updateDraft(q.questionId, { scoreText: event.target.value })}
                        className={SCORE_INPUT_CLASS}
                      />
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                    {t('teacherAttemptDetail.commentOptional')}
                    <textarea
                      rows={3}
                      value={drafts[q.questionId]?.comment ?? ''}
                      onChange={(event) => updateDraft(q.questionId, { comment: event.target.value })}
                      placeholder={t('teacherAttemptDetail.feedbackPlaceholder')}
                      className={COMMENT_INPUT_CLASS}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        q.essayUseIeltsCriteria
                          ? handleSaveIeltsGrade(q.questionId, true)
                          : handleSaveGrade(q.questionId, q.essayMaxScore, true)
                      }
                      disabled={savingQuestionId === q.questionId || result.status !== 'submitted'}
                      className={SAVE_NEXT_BUTTON_CLASS}
                    >
                      {savingQuestionId === q.questionId ? t('teacherAttemptDetail.saving') : t('scoring.grade.saveAndNext')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        q.essayUseIeltsCriteria
                          ? handleSaveIeltsGrade(q.questionId)
                          : handleSaveGrade(q.questionId, q.essayMaxScore)
                      }
                      disabled={savingQuestionId === q.questionId || result.status !== 'submitted'}
                      className={SAVE_BUTTON_CLASS}
                    >
                      {t('teacherAttemptDetail.saveGrade')}
                    </button>
                  </div>
                  {gradingErrors[q.questionId] && (
                    <p role="alert" className="text-sm font-medium text-red-700">
                      {gradingErrors[q.questionId]}
                    </p>
                  )}
                  <p
                    role="status"
                    aria-live="polite"
                    className={savedMessages[q.questionId] ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800' : 'sr-only'}
                  >
                    {savedMessages[q.questionId] ?? ''}
                  </p>
                </div>
                {q.manualComment && (
                  <p className="text-xs italic text-base-black/60">
                    {t('teacherAttemptDetail.commentLine', { comment: q.manualComment })}
                  </p>
                )}
              </div>
            ) : q.type === 'speaking' ? (
              <div className="mt-2 flex flex-col gap-3 text-sm text-base-black/80">
                {q.speakingAudioData ? (
                  <audio controls src={q.speakingAudioData} className="w-full" />
                ) : (
                  <p className="italic text-base-black/50">{t('teacherAttemptDetail.noRecordingSubmitted')}</p>
                )}
                <div className="rounded-md border border-primary-100 bg-base-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                    {t('teacherAttemptDetail.draftTranscriptLabel')}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {q.speakingTranscript?.trim() ? q.speakingTranscript : <em>{t('teacherAttemptDetail.noTranscript')}</em>}
                  </p>
                </div>
                {q.speakingAiFellBackToMock && (
                  <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    {t('teacherAttemptDetail.speakingAiFallbackWarning')}
                  </p>
                )}
                {q.speakingAiFeedback && (
                  <div className="rounded-md border border-primary-100 bg-primary-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-base-black/50">
                      {t('common.aiNote')}
                    </p>
                    <AiFeedbackSections feedback={q.speakingAiFeedback} className="mt-1" />
                  </div>
                )}
                {q.speakingAudioData ? (
                  <div className="flex flex-col gap-3 rounded-md border border-primary-100 bg-primary-50 p-3">
                    <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                      {t('teacherAttemptDetail.overrideScoreOutOf', { scale: SPEAKING_SCORE_SCALE })}
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={drafts[q.questionId]?.scoreText ?? ''}
                        onChange={(event) => updateDraft(q.questionId, { scoreText: event.target.value })}
                        className={SCORE_INPUT_CLASS}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
                      {t('teacherAttemptDetail.overrideFeedbackOptional')}
                      <textarea
                        rows={3}
                        value={drafts[q.questionId]?.comment ?? ''}
                        onChange={(event) => updateDraft(q.questionId, { comment: event.target.value })}
                        placeholder={t('teacherAttemptDetail.overrideFeedbackPlaceholder')}
                        className={COMMENT_INPUT_CLASS}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveGrade(q.questionId, SPEAKING_SCORE_SCALE)}
                        disabled={savingQuestionId === q.questionId || result.status !== 'submitted'}
                        className={SAVE_NEXT_BUTTON_CLASS}
                      >
                        {savingQuestionId === q.questionId ? t('teacherAttemptDetail.saving') : t('teacherAttemptDetail.saveOverride')}
                      </button>
                    </div>
                    {gradingErrors[q.questionId] && (
                      <p role="alert" className="text-sm font-medium text-red-700">
                        {gradingErrors[q.questionId]}
                      </p>
                    )}
                    <p
                      role="status"
                      aria-live="polite"
                      className={savedMessages[q.questionId] ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800' : 'sr-only'}
                    >
                      {savedMessages[q.questionId] ?? ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-base-black/50">
                    {t('teacherAttemptDetail.nothingToOverrideYet')}
                  </p>
                )}
                {q.manualComment && (
                  <p className="text-xs italic text-base-black/60">
                    {t('teacherAttemptDetail.teacherOverrideCommentLine', { comment: q.manualComment })}
                  </p>
                )}
              </div>
            ) : q.type === 'fillBlank' ? (
              <div className="mt-2 text-sm text-base-black/80">
                <p>
                  {t('teacherAttemptDetail.studentAnswerPrefix')}{' '}
                  {q.textAnswer?.trim() ? q.textAnswer : <em>{t('teacherAttemptDetail.noAnswer')}</em>}
                </p>
                <p>
                  {t('teacherAttemptDetail.acceptedAnswersPrefix')} {q.acceptedAnswers.join(', ')}
                </p>
              </div>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {q.choices.map((choice) => {
                  const isSelected = choice.id === q.selectedChoiceId;
                  return (
                    <li
                      key={choice.id}
                      className={`rounded px-2 py-1 ${
                        choice.isCorrect
                          ? 'bg-green-100 font-medium text-green-800'
                          : isSelected
                            ? 'bg-red-100 text-red-800'
                            : 'text-base-black/70'
                      }`}
                    >
                      {choice.text}
                      {isSelected && t('teacherAttemptDetail.studentAnswerSuffix')}
                      {choice.isCorrect && t('teacherAttemptDetail.correctAnswerSuffix')}
                    </li>
                  );
                })}
                {!q.selectedChoiceId && <li className="text-base-black/50">{t('teacherAttemptDetail.noAnswerSelected')}</li>}
              </ul>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export default TeacherAttemptDetailPage;
