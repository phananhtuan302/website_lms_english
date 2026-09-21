import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ClassAssignmentFlashcardSetDTO,
  ClassAssignmentGrammarTopicDTO,
  ClassAssignmentTestDTO,
  ClassAssignmentsResponseDTO,
  TeacherContentType,
} from '@platform/shared';
import TestClassSchedulePanel from '../../components/TestClassSchedulePanel';
import { useClassWorkspace } from '../../hooks/useClassWorkspace';
import { ApiError } from '../../lib/apiClient';
import { withClassPrefix } from '../../lib/classLabel';
import {
  TEST_TYPE_LABEL_KEYS,
  classTestResultsPath,
  classVocabularyChecksPath,
  contentEditorPath,
  formatDateTime,
  scheduleWindowState,
  setClassAssignment,
} from '../../lib/classAssignments';
import { teacherApi } from '../../lib/teacherApi';
import AssignDialog from './AssignDialog';

type Filter = 'all' | TeacherContentType;

const FILTERS: Array<{ value: Filter; labelKey: string }> = [
  { value: 'all', labelKey: 'classAssignments.filters.all' },
  { value: 'test', labelKey: 'classAssignments.filters.test' },
  { value: 'flashcardSet', labelKey: 'classAssignments.filters.flashcardSet' },
  { value: 'grammarTopic', labelKey: 'classAssignments.filters.grammarTopic' },
];

type Row =
  | { kind: 'test'; key: string; assignedAt: string; title: string; item: ClassAssignmentTestDTO }
  | { kind: 'flashcardSet'; key: string; assignedAt: string; title: string; item: ClassAssignmentFlashcardSetDTO }
  | { kind: 'grammarTopic'; key: string; assignedAt: string; title: string; item: ClassAssignmentGrammarTopicDTO };

function buildRows(data: ClassAssignmentsResponseDTO): Row[] {
  const rows: Row[] = [
    ...data.tests.map((item): Row => ({ kind: 'test', key: `test:${item.id}`, assignedAt: item.assignedAt, title: item.title, item })),
    ...data.flashcardSets.map(
      (item): Row => ({ kind: 'flashcardSet', key: `flashcardSet:${item.id}`, assignedAt: item.assignedAt, title: item.name, item }),
    ),
    ...data.grammarTopics.map(
      (item): Row => ({ kind: 'grammarTopic', key: `grammarTopic:${item.id}`, assignedAt: item.assignedAt, title: item.title, item }),
    ),
  ];
  // Newest assignment first — what the teacher just gave is what they want to see.
  return rows.sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
}

const badgeClass = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
const actionClass =
  'rounded-md border border-primary-300 bg-base-white px-3 py-3 sm:py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * "Bài tập" tab (T-103, Phase 13) — ONE list of everything given to this class for its
 * current semester (tests of every kind, flashcard sets, grammar topics), replacing the old
 * My Content / Unit Tests / per-test report screens. Each test row carries a plain-language
 * status straight from its class schedule; the row actions cover everything a teacher does
 * to an assignment: see results, edit the schedule / publish scores (inline, via the existing
 * `TestClassSchedulePanel`), edit the content in the Library, or take it away from the class.
 * New assignments come from the "Giao bài mới" dialog. The Tổng quan tab's "Giao bài mới"
 * shortcut links here with `?assign=1`: the dialog then opens on arrival (only when the class has
 * a semester) and the flag is dropped from the URL, so a reload or the Back button never reopens it.
 */
function ClassAssignmentsTab() {
  const { cls } = useClassWorkspace();
  const { t, i18n } = useTranslation();
  const periodId = cls.currentPeriodId;
  const classLabel = withClassPrefix(cls.name);
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<ClassAssignmentsResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [scheduleOpenFor, setScheduleOpenFor] = useState<string | null>(null);
  // Read once, on arrival: the `assign` flag asks for the dialog, the effect below then removes it.
  const [dialogOpen, setDialogOpen] = useState(() => searchParams.get('assign') === '1' && Boolean(periodId));
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const refresh = useCallback(() => {
    return teacherApi
      .getClassAssignments(cls.id)
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : t('classAssignments.loadFailed'));
      });
  }, [cls.id, t]);

  // Reload whenever the class's semester changes (header dropdown) — a different semester is a
  // different list. The previous semester's data is never shown as if it were current
  // (`data.periodId` is checked against the class's live `currentPeriodId` below).
  useEffect(() => {
    if (!periodId) return;
    void refresh();
  }, [periodId, refresh]);

  useEffect(() => {
    if (!searchParams.has('assign')) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('assign');
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const current = data && data.periodId === periodId ? data : null;
  const rows = useMemo(() => (current ? buildRows(current) : []), [current]);
  const counts = useMemo(
    () => ({
      all: rows.length,
      test: rows.filter((row) => row.kind === 'test').length,
      flashcardSet: rows.filter((row) => row.kind === 'flashcardSet').length,
      grammarTopic: rows.filter((row) => row.kind === 'grammarTopic').length,
    }),
    [rows],
  );
  const visibleRows = filter === 'all' ? rows : rows.filter((row) => row.kind === filter);

  async function handleRemove(row: Row) {
    if (removingKey) return;
    if (!window.confirm(t('classAssignments.confirmRemove', { title: row.title, className: classLabel }))) return;
    setRemovingKey(row.key);
    setNotice(null);
    try {
      await setClassAssignment(row.kind, row.item.id, cls.id, false);
      if (scheduleOpenFor === row.item.id) setScheduleOpenFor(null);
      setNotice({ kind: 'ok', text: t('classAssignments.removed', { title: row.title }) });
      await refresh();
    } catch (err) {
      setNotice({
        kind: 'error',
        text: t('classAssignments.removeFailed', {
          title: row.title,
          reason: err instanceof ApiError ? err.message : t('assignDialog.unknownError'),
        }),
      });
    } finally {
      setRemovingKey(null);
    }
  }

  function handleDialogClose(assignedCount: number) {
    setDialogOpen(false);
    if (assignedCount > 0) {
      setNotice({ kind: 'ok', text: t('classAssignments.assignedNotice', { count: assignedCount }) });
      void refresh();
    }
  }

  function renderTestStatus(item: ClassAssignmentTestDTO) {
    const state = scheduleWindowState(item.schedule);
    const openAt = item.schedule?.openAt ? formatDateTime(item.schedule.openAt, i18n.language) : null;
    const closeAt = item.schedule?.closeAt ? formatDateTime(item.schedule.closeAt, i18n.language) : null;
    if (state === 'upcoming') {
      return (
        <>
          <span className={`${badgeClass} bg-sky-100 text-sky-800`}>
            {t('classAssignments.status.upcoming', { time: openAt })}
          </span>
          {closeAt && (
            <span className="text-xs text-base-black/60">{t('classAssignments.status.closesAt', { time: closeAt })}</span>
          )}
        </>
      );
    }
    if (state === 'open') {
      return (
        <span className={`${badgeClass} bg-green-100 text-green-800`}>
          {closeAt ? t('classAssignments.status.open', { time: closeAt }) : t('classAssignments.status.openNoClose')}
        </span>
      );
    }
    if (state === 'closed') {
      return <span className={`${badgeClass} bg-red-100 text-red-800`}>{t('classAssignments.status.closed')}</span>;
    }
    return (
      <span className={`${badgeClass} bg-base-black/5 text-base-black/70`}>
        {t('classAssignments.status.unlimited')}
      </span>
    );
  }

  function renderRow(row: Row) {
    const removing = removingKey === row.key;
    const testItem = row.kind === 'test' ? row.item : null;
    const typeLabelKey =
      row.kind === 'test'
        ? TEST_TYPE_LABEL_KEYS[row.item.testType]
        : row.kind === 'flashcardSet'
          ? 'classAssignments.types.flashcardSet'
          : 'classAssignments.types.grammarTopic';
    const typeBadgeColor =
      row.kind === 'test'
        ? row.item.testType === 'unitTest'
          ? 'bg-purple-100 text-purple-800'
          : 'bg-primary-100 text-primary-800'
        : row.kind === 'flashcardSet'
          ? 'bg-teal-100 text-teal-800'
          : 'bg-indigo-100 text-indigo-800';

    const unitName = row.item.unitName;
    const sizeText =
      row.kind === 'test'
        ? t('classAssignments.questionCount', { count: row.item.questionCount })
        : row.kind === 'flashcardSet'
          ? t('classAssignments.cardCount', { count: row.item.cardCount })
          : t('classAssignments.exerciseCount', { count: row.item.exerciseCount });

    return (
      <li key={row.key} className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-base-white p-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${badgeClass} ${typeBadgeColor}`}>{t(typeLabelKey)}</span>
            <h3 className="min-w-0 break-words text-base font-semibold text-base-black">{row.title}</h3>
          </div>
          <p className="text-xs text-base-black/60">
            {unitName ? `${unitName} · ` : ''}
            {sizeText}
          </p>

          {testItem && (
            <div className="flex flex-wrap items-center gap-2">
              {renderTestStatus(testItem)}
              <span
                className={`${badgeClass} ${
                  testItem.schedule?.scoresPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {testItem.schedule?.scoresPublished
                  ? t('classAssignments.scores.published')
                  : t('classAssignments.scores.unpublished')}
              </span>
              <span className="text-xs font-medium text-base-black/70">
                {t('classAssignments.submitted', {
                  submitted: testItem.submittedStudentCount,
                  total: current?.studentCount ?? 0,
                })}
              </span>
            </div>
          )}

          {testItem && testItem.variantCount === 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              {t('classAssignments.warnings.noVariants')}
            </p>
          )}
          {testItem && testItem.testType === 'unitTest' && !testItem.published && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              {t('classAssignments.warnings.notPublished')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {testItem && (
            <>
              <Link
                to={classTestResultsPath(cls.id, testItem.id)}
                aria-label={t('classAssignments.actions.resultsAria', { title: row.title })}
                className={actionClass}
              >
                {t('classAssignments.actions.results')}
              </Link>
              <button
                type="button"
                aria-expanded={scheduleOpenFor === testItem.id}
                aria-label={t('classAssignments.actions.scheduleAria', { title: row.title })}
                onClick={() => setScheduleOpenFor((open) => (open === testItem.id ? null : testItem.id))}
                className={actionClass}
              >
                {t('classAssignments.actions.schedule')}
              </button>
            </>
          )}
          <Link
            to={contentEditorPath(row.kind, row.item.id)}
            aria-label={t('classAssignments.actions.editAria', { title: row.title })}
            className={actionClass}
          >
            {t('classAssignments.actions.edit')}
          </Link>
          {testItem && testItem.testType === 'unitTest' && testItem.unitId && (
            <Link
              to={`/units/${encodeURIComponent(testItem.unitId)}/leaderboard`}
              aria-label={t('classAssignments.actions.unitLeaderboardAria', { title: row.title })}
              className={actionClass}
            >
              {t('classAssignments.actions.unitLeaderboard')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => void handleRemove(row)}
            disabled={removingKey !== null}
            aria-label={t('classAssignments.actions.removeAria', { title: row.title })}
            className="rounded-md border border-red-300 bg-base-white px-3 py-3 sm:py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {removing ? t('classAssignments.actions.removing') : t('classAssignments.actions.remove')}
          </button>
        </div>

        {testItem && scheduleOpenFor === testItem.id && (
          <TestClassSchedulePanel
            testId={testItem.id}
            classId={cls.id}
            className={classLabel}
            onClose={() => setScheduleOpenFor(null)}
            onChanged={() => {
              // A banner such as "Đã giao 1 bài cho lớp." is stale once the teacher acts on a row.
              setNotice(null);
              void refresh();
            }}
          />
        )}
      </li>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-primary-700">
          {cls.currentPeriodName
            ? t('classAssignments.heading', { semester: cls.currentPeriodName })
            : t('classAssignments.headingPlain')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to={classVocabularyChecksPath(cls.id)}
            className="rounded-md border border-primary-300 bg-base-white px-4 py-2.5 sm:py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('classAssignments.createVocabCheck')}
          </Link>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setDialogOpen(true);
            }}
            disabled={!periodId}
            className="rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('classAssignments.assignNew')}
          </button>
        </div>
      </div>

      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={
            'rounded-md border px-3 py-2 text-sm ' +
            (notice.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-800')
          }
        >
          {notice.text}
        </p>
      )}

      {!periodId && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900">
          <p className="font-semibold">{t('classAssignments.noSemester.heading')}</p>
          <p className="mt-1 text-sm">{t('classAssignments.noSemester.message')}</p>
        </div>
      )}

      {periodId && error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {periodId && !current && !error && <p className="text-sm text-base-black/60">{t('common.loading')}</p>}

      {periodId && current && (
        <>
          {rows.length > 0 && (
            <div role="group" aria-label={t('classAssignments.filtersLabel')} className="flex flex-wrap gap-2">
              {FILTERS.map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={
                    'rounded-full border px-4 py-2.5 sm:py-1.5 text-sm font-medium transition-colors ' +
                    (filter === value
                      ? 'border-primary-500 bg-primary-500 text-base-white'
                      : 'border-primary-200 bg-base-white text-primary-700 hover:bg-primary-50')
                  }
                >
                  {t(labelKey)} ({counts[value]})
                </button>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-primary-300 bg-primary-50 p-8 text-center">
              <p className="text-base font-semibold text-primary-700">{t('classAssignments.empty')}</p>
            </div>
          ) : visibleRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-primary-200 px-3 py-6 text-center text-sm text-base-black/60">
              {t('classAssignments.emptyFiltered')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">{visibleRows.map(renderRow)}</ul>
          )}
        </>
      )}

      {dialogOpen && periodId && <AssignDialog classId={cls.id} className={classLabel} onClose={handleDialogClose} />}
    </section>
  );
}

export default ClassAssignmentsTab;
