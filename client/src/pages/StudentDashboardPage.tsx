import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  StudentAssignmentDTO,
  StudentAssignmentStatus,
  StudentAssignmentsResponseDTO,
} from '@platform/shared';
import { useAuth } from '../context/useAuth';
import { studentApi } from '../lib/studentApi';
import { ApiError } from '../lib/apiClient';
import StudentAnnouncementsCard from '../components/StudentAnnouncementsCard';
import { closingSoonRemaining } from '../lib/closingSoon';
import { formatDeadlineLine, formatDeadlineWhen } from '../lib/humanDeadline';
import { withClassPrefix } from '../lib/classLabel';

/**
 * Student home = "Bài cần làm" (T-105, Phase 13): ONE to-do list of everything the student
 * has been given, in the way a Google Classroom / Canvas "To-do" view works — replacing the
 * six per-content-type student menus the product used to have. Reachable at
 * `/student/dashboard` behind `ProtectedRoute allowedRoles={['student']}`.
 *
 * All status logic lives on the server (`GET /api/student/assignments`,
 * `server/src/lib/studentAssignments.ts`), which derives each row's status from the exact
 * rules the start endpoint enforces — this page only groups rows into sections and renders
 * them, so it can never show a "Làm bài" button for something the server would reject.
 * Flashcard sets and Grammar topics come back in the same list but are study areas that are
 * always available, so they are NOT to-do rows: they only feed the "Học tập" strip below.
 */

/** Section order = the order a student should look at things: what's half-done first, then
 * what's open, what's coming, what's finished, and last what was missed. The first three are
 * "still to do" and sit at the top of the page; the last two are history and sit below the
 * teacher's announcements (T-113: on a phone the homework must be the first thing on screen). */
const ACTIVE_SECTIONS: StudentAssignmentStatus[] = ['inProgress', 'open', 'upcoming'];
const HISTORY_SECTIONS: StudentAssignmentStatus[] = ['submitted', 'closed'];

type TodoKind = 'test' | 'unitTest' | 'vocabularyCheck';

const KIND_BADGE_CLASS: Record<TodoKind, string> = {
  test: 'bg-primary-100 text-primary-800',
  unitTest: 'bg-amber-100 text-amber-800',
  vocabularyCheck: 'bg-sky-100 text-sky-800',
};

function isTodo(item: StudentAssignmentDTO): item is StudentAssignmentDTO & { kind: TodoKind } {
  return item.kind === 'test' || item.kind === 'unitTest' || item.kind === 'vocabularyCheck';
}

function formatTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Scores are stored as floats; show at most one decimal so "66.7" not "66.66666666". */
function formatPercent(percent: number): string {
  return String(Math.round(percent * 10) / 10);
}

interface RowProps {
  item: StudentAssignmentDTO & { kind: TodoKind };
  startingId: string | null;
  onStart: (testId: string) => void;
}

function AssignmentRow({ item, startingId, onStart }: RowProps) {
  const { t, i18n } = useTranslation();
  const attempt = item.myAttempt;
  // T-109: an item still to be handed in that closes within 48 hours gets a "Sắp đóng" tag.
  const closing =
    item.status === 'open' || item.status === 'inProgress' ? closingSoonRemaining(item.closeAt) : null;
  // T-113: the deadline the way a child reads it ("Hạn: 5:49 chiều mai (Thứ Ba)"); the exact
  // date + time stays available as the tooltip.
  const deadline = item.closeAt ? formatDeadlineLine(item.closeAt, t, i18n.language) : null;
  const primaryButton =
    'inline-flex shrink-0 items-center justify-center rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60';

  let meta: string;
  switch (item.status) {
    case 'inProgress':
      meta = deadline ? `${t('studentHome.meta.inProgress')} · ${deadline}` : t('studentHome.meta.inProgress');
      break;
    case 'open':
      meta = deadline ?? t('studentHome.meta.noDeadline');
      break;
    case 'upcoming':
      meta = item.openAt
        ? t('studentHome.meta.opensAt', { time: formatTime(item.openAt, i18n.language) })
        : t('studentHome.meta.notOpenYet');
      break;
    case 'submitted':
      meta =
        attempt?.scoresPublished && attempt.scorePercent != null
          ? t('studentHome.meta.score', { percent: formatPercent(attempt.scorePercent) })
          : t('studentHome.meta.awaitingPublish');
      break;
    case 'closed':
      meta = item.closeAt
        ? t('studentHome.meta.closedAt', { time: formatTime(item.closeAt, i18n.language) })
        : t('studentHome.meta.closed');
      break;
  }

  let action: ReactNode = null;
  if (item.status === 'inProgress' && attempt) {
    action = (
      <Link to={`/student/attempts/${attempt.attemptId}`} className={primaryButton}>
        {t('studentHome.action.resume')}
      </Link>
    );
  } else if (item.status === 'open') {
    action = (
      <button
        type="button"
        onClick={() => onStart(item.id)}
        disabled={startingId !== null}
        className={primaryButton}
      >
        {startingId === item.id ? t('studentHome.action.starting') : t('studentHome.action.start')}
      </button>
    );
  } else if (item.status === 'submitted' && attempt) {
    action = (
      <Link
        to={`/student/attempts/${attempt.attemptId}/result`}
        className="inline-flex shrink-0 items-center justify-center rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
      >
        {attempt.scoresPublished && attempt.scorePercent != null
          ? t('studentHome.action.viewResult')
          : t('studentHome.action.viewSubmitted')}
      </Link>
    );
  } else if (item.status === 'upcoming') {
    action = (
      <span className="inline-flex shrink-0 items-center rounded-md bg-base-black/5 px-4 py-2 text-sm font-medium text-base-black/50">
        {t('studentHome.action.notOpen')}
      </span>
    );
  }

  const dimmed = item.status === 'closed';
  const titleLink =
    attempt && item.status === 'submitted'
      ? `/student/attempts/${attempt.attemptId}/result`
      : attempt && item.status === 'inProgress'
        ? `/student/attempts/${attempt.attemptId}`
        : null;

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        item.status === 'inProgress' ? 'border-primary-300 bg-primary-50' : 'border-primary-100 bg-base-white'
      } ${dimmed ? 'opacity-70' : ''}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE_CLASS[item.kind]}`}>
            {t(`studentHome.kind.${item.kind}`)}
          </span>
          {item.unitName && <span className="text-xs text-base-black/50">{item.unitName}</span>}
          {closing && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {closing.lessThanHour
                ? t('studentNotifications.closingTag.lessThanHour')
                : t('studentNotifications.closingTag.hours', { count: closing.hours })}
            </span>
          )}
        </div>
        <p className="mt-1 text-base font-semibold text-base-black">
          {titleLink ? (
            <Link to={titleLink} className="hover:underline">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </p>
        <p
          className="mt-0.5 text-sm text-base-black/70"
          title={item.closeAt && (item.status === 'open' || item.status === 'inProgress') ? formatTime(item.closeAt, i18n.language) : undefined}
        >
          {meta}
        </p>
        {item.kind === 'unitTest' && item.unitId && (
          <Link
            to={`/units/${item.unitId}/leaderboard`}
            className="mt-1 inline-block text-xs font-medium text-primary-600 hover:underline"
          >
            {t('studentHome.unitRanking')}
          </Link>
        )}
      </div>
      {action}
    </li>
  );
}

function StudyCard({
  to,
  title,
  description,
}: {
  to: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col rounded-lg border border-primary-200 bg-base-white px-4 py-3 transition-colors hover:border-primary-400 hover:bg-primary-50"
    >
      <span className="text-sm font-semibold text-primary-700">{title}</span>
      <span className="mt-0.5 text-xs text-base-black/60">{description}</span>
    </Link>
  );
}

function StudentDashboardPage() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState<StudentAssignmentsResponseDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  // Bumped to re-run the fetch effect (after a failed start, since the list may be stale,
  // or via the "Thử lại" button) without calling `setState` synchronously from the effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    studentApi
      .listAssignments()
      .then((res) => {
        setData(res);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : t('studentHome.loadFailed')));
    // `t` is stable in practice (i18next only re-creates it on a real language change,
    // which never happens mid-session per PROJECT_PLAN Guiding Principle 3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  async function handleStart(testId: string) {
    setStartingId(testId);
    setStartError(null);
    try {
      const res = await studentApi.startPractice(testId);
      navigate(
        res.status === 'submitted'
          ? `/student/attempts/${res.attemptId}/result`
          : `/student/attempts/${res.attemptId}`,
      );
    } catch (err) {
      // Show the server's own reason (e.g. "Bài chưa mở, quay lại sau.") and refresh the
      // list, since a rejection means what the page showed is now out of date.
      setStartError(err instanceof ApiError ? err.message : t('studentHome.startFailed'));
      setStartingId(null);
      setReloadKey((k) => k + 1);
    }
  }

  const todoItems = data?.items.filter(isTodo) ?? [];
  const flashcardCount = data?.items.filter((i) => i.kind === 'flashcardSet').length ?? 0;
  const grammarCount = data?.items.filter((i) => i.kind === 'grammarTopic').length ?? 0;

  let classLine: string | null = null;
  if (data) {
    // No class at all: the help panel below explains it, so no line up here.
    const className = data.className ? withClassPrefix(data.className) : null;
    if (!className) classLine = null;
    else if (!data.periodName) classLine = t('studentHome.classOnly', { className });
    else classLine = t('studentHome.classLine', { className, periodName: data.periodName });
  }

  // T-113: "what do I have to do?" in one line under the greeting. Only what can be done now
  // (half-done + open) counts; the nearest of their deadlines is the one worth naming.
  const actionable = todoItems.filter((item) => item.status === 'inProgress' || item.status === 'open');
  const closeTimes = actionable.flatMap((item) => (item.closeAt ? [Date.parse(item.closeAt)] : []));
  const nearestClose = closeTimes.length > 0 ? new Date(Math.min(...closeTimes)).toISOString() : null;
  let summary: string | null = null;
  if (actionable.length > 0) {
    summary = nearestClose
      ? t('studentHome.summaryTodoDeadline', {
          count: actionable.length,
          when: formatDeadlineWhen(nearestClose, t, i18n.language),
        })
      : t('studentHome.summaryTodo', { count: actionable.length });
  }
  const hasSubmitted = todoItems.some((item) => item.status === 'submitted');

  function renderSections(statuses: StudentAssignmentStatus[]) {
    return statuses.map((status) => {
      const rows = todoItems.filter((item) => item.status === status);
      // Empty sections are hidden entirely rather than showing an "empty" line — a
      // to-do view reads cleaner when it only shows what actually exists.
      if (rows.length === 0) return null;
      return (
        <section key={status} aria-labelledby={`section-${status}`}>
          <h2 id={`section-${status}`} className="flex items-baseline gap-2 text-lg font-bold text-base-black">
            {t(`studentHome.section.${status}`)}
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800">
              {rows.length}
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-base-black/50">{t(`studentHome.sectionHint.${status}`)}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {rows.map((item) => (
              <AssignmentRow key={`${item.kind}-${item.id}`} item={item} startingId={startingId} onStart={handleStart} />
            ))}
          </ul>
        </section>
      );
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:gap-6">
      <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 sm:px-6 sm:py-4">
        <h1 className="text-xl font-bold text-primary-700 sm:text-2xl">{t('studentHome.heading')}</h1>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-base-black/70">
          <span>{t('studentHome.greeting', { name: user?.name })}</span>
          {classLine && <span className="whitespace-nowrap font-medium text-primary-700">{classLine}</span>}
        </p>
        {summary && <p className="mt-2 text-base font-semibold text-base-black">{summary}</p>}
      </div>

      {startError && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {startError}
        </p>
      )}

      {loadError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-1 font-medium underline"
          >
            {t('studentHome.retry')}
          </button>
        </div>
      )}
      {!data && !loadError && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {data && !data.className && (
        <p className="rounded-lg border border-primary-100 px-4 py-6 text-center text-sm text-base-black/70">
          {t('studentHome.noClassHelp')}
        </p>
      )}
      {data && data.className && !data.periodName && todoItems.length === 0 && (
        <p className="rounded-lg border border-primary-100 px-4 py-6 text-center text-sm text-base-black/70">
          {t('studentHome.noPeriodHelp')}
        </p>
      )}
      {data && data.className && data.periodName && todoItems.length === 0 && (
        <div className="rounded-lg border border-primary-100 px-4 py-8 text-center">
          <p className="text-base font-semibold text-base-black">{t('studentHome.emptyTitle')}</p>
          <p className="mt-1 text-sm text-base-black/60">{t('studentHome.emptyHint')}</p>
        </div>
      )}

      {/* T-113: nothing left to do right now — say so warmly and point at something useful. */}
      {data && data.className && data.periodName && todoItems.length > 0 && actionable.length === 0 && (
        <div
          className={`rounded-xl border px-4 py-4 text-center ${
            hasSubmitted ? 'border-green-200 bg-green-50' : 'border-primary-100 bg-base-white'
          }`}
        >
          <p className={`text-base font-semibold ${hasSubmitted ? 'text-green-800' : 'text-base-black'}`}>
            {hasSubmitted ? t('studentHome.allDoneTitle') : t('studentHome.nothingOpenTitle')}
          </p>
          <Link
            to="/student/flashcard-sets"
            className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 hover:underline"
          >
            {t('studentHome.reviewLink')}
          </Link>
        </div>
      )}

      {renderSections(ACTIVE_SECTIONS)}

      {/* T-113: the calendar (now "Hạn nộp bài") is a normal-sized card, not a tiny text link. */}
      {data && data.className && (
        <Link
          to="/student/calendar"
          className="flex min-h-14 flex-col justify-center rounded-lg border border-primary-200 bg-base-white px-4 py-3 transition-colors hover:border-primary-400 hover:bg-primary-50"
        >
          <span className="text-base font-semibold text-primary-700">{t('studentCalendar.homeLink')}</span>
          <span className="text-sm text-base-black/60">{t('studentCalendar.homeLinkHint')}</span>
        </Link>
      )}

      <StudentAnnouncementsCard />

      {renderSections(HISTORY_SECTIONS)}

      <section aria-labelledby="section-study">
        <h2 id="section-study" className="text-lg font-bold text-base-black">
          {t('studentHome.study.heading')}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StudyCard
            to="/student/flashcard-sets"
            title={t('studentHome.study.flashcards')}
            description={
              data && flashcardCount === 0
                ? t('studentHome.study.noneAssigned')
                : t('studentHome.study.flashcardsHint', { count: flashcardCount })
            }
          />
          <StudyCard
            to="/student/grammar-topics"
            title={t('studentHome.study.grammar')}
            description={
              data && grammarCount === 0
                ? t('studentHome.study.noneAssigned')
                : t('studentHome.study.grammarHint', { count: grammarCount })
            }
          />
          <StudyCard
            to="/student/vocab-progress"
            title={t('studentHome.study.progress')}
            description={t('studentHome.study.progressHint')}
          />
          <StudyCard
            to="/vocab-leaderboard"
            title={t('studentHome.study.leaderboard')}
            description={t('studentHome.study.leaderboardHint')}
          />
        </div>
      </section>
    </div>
  );
}

export default StudentDashboardPage;
