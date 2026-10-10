import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AcademicPeriodDTO, ClassAttentionDTO, ClassDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { classTabPath } from '../lib/classWorkspace';
import { useAuth } from '../context/useAuth';
import PageBanner from '../components/PageBanner';

/** Header-band variants cycled across the cards so a grid of classes is easy to tell apart at a
 * glance (Google Classroom style), including once a teacher has 6+ classes (T-117/T-118C, Phase
 * 17 — the earlier 4-shade array repeated every 4 cards, e.g. classes 1 and 5 read the same).
 * Every variant stays within the single `primary` brand hue — this app deliberately has no
 * separate accent color (see the note at the top of `tailwind.config.js`) — by ALTERNATING solid
 * dark shades (white class-name text) with light/mid pastel shades (dark `primary-900` text, the
 * same style of pairing the semester badge and the "cần chấm" attention badge below already use
 * for this hue), which reads as far more distinct card-to-card than shade alone. This uses ALL
 * TEN steps of the `primary` scale (50–900) — a first draft that stopped at 8 and split evenly
 * into "4 light + 4 dark" was screenshotted with a throwaway 8-class fixture and still showed
 * two adjacent cards sharing the exact same dark shade, plus the untextured 50/100/200/300 light
 * end reading as one indistinct pastel blob; pairing `primary-400`/`primary-500` with DARK
 * (`primary-900`) text instead of white — measured ~4.6:1 / ~3.6:1, both meeting the WCAG
 * "large text" 3:1 floor the Phase 15 readability pass (T-116, `docs/BACKLOG.md`) established
 * site-wide, unlike white-on-400/500 which measures only ~2.4:1 / ~3.05:1 — fills that gap with
 * two genuinely mid-tone bands and grows the palette to 10, both increasing the visual spread and
 * lowering (not eliminating — see below) the chance of two hash-adjacent classes matching.
 * Every combination keeps the class-name text (`text-xl font-bold`, WCAG "large text") at 3:1 or
 * better; most are far higher (the darkest light-family pair, primary-500/primary-900 text, is
 * the tightest at ~3.6:1). Listed as literal class strings so Tailwind's scanner sees them.
 * Assignment is by a deterministic hash of the class's OWN id (`cardBandForClass`), not its
 * position in the array — so a class keeps the same band across reloads and after classes are
 * added/removed/reordered, instead of shifting like an index-based cycle would. Being a hash
 * into a fixed small on-brand palette, this is a large practical improvement over the old
 * strictly-periodic 4-cycle (which GUARANTEED an identical neighbour starting at the 5th class)
 * but is not a mathematical guarantee against a rare coincidental repeat once a teacher has many
 * classes — no fixed palette within one hue could promise that; the light/dark alternation
 * itself remains the strongest, most reliable disambiguator between any two specific cards. */
const CARD_BANDS: ReadonlyArray<{ bg: string; text: string }> = [
  { bg: 'bg-primary-900', text: 'text-base-white' },
  { bg: 'bg-primary-100', text: 'text-primary-900' },
  { bg: 'bg-primary-700', text: 'text-base-white' },
  { bg: 'bg-primary-300', text: 'text-primary-900' },
  { bg: 'bg-primary-800', text: 'text-base-white' },
  { bg: 'bg-primary-50', text: 'text-primary-900' },
  { bg: 'bg-primary-600', text: 'text-base-white' },
  { bg: 'bg-primary-500', text: 'text-primary-900' },
  { bg: 'bg-primary-400', text: 'text-primary-900' },
  { bg: 'bg-primary-200', text: 'text-primary-900' },
];

/** Small, fast, deterministic string hash (DJB2 variant) — the same class id always maps to the
 * same `CARD_BANDS` entry, independent of load order or where the class sits in the list. */
function hashClassId(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

function cardBandForClass(classId: string): { bg: string; text: string } {
  return CARD_BANDS[hashClassId(classId) % CARD_BANDS.length];
}

/**
 * The semester a NEW class should start in, so it can be given work straight away: the one most
 * of the teacher's existing classes already use (ties go to the later one); with no such class,
 * the semester that includes today; failing that, the latest one. `''` when there are none.
 */
function defaultPeriodId(periods: AcademicPeriodDTO[], classes: ClassDTO[]): string {
  if (periods.length === 0) return '';
  const latestFirst = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const usage = new Map<string, number>();
  for (const cls of classes) {
    if (cls.currentPeriodId) usage.set(cls.currentPeriodId, (usage.get(cls.currentPeriodId) ?? 0) + 1);
  }
  let best: AcademicPeriodDTO | null = null;
  for (const period of latestFirst) {
    const count = usage.get(period.id) ?? 0;
    if (count > 0 && (best === null || count > (usage.get(best.id) ?? 0))) best = period;
  }
  if (best) return best.id;
  const now = Date.now();
  const current = latestFirst.find(
    (period) => Date.parse(period.startDate) <= now && now <= Date.parse(period.endDate),
  );
  return (current ?? latestFirst[0]).id;
}

/** The "what needs you" line of a class card: one small badge per non-zero count, or a quiet
 * "no urgent work" when the class has a semester and all three are zero. Nothing while the
 * counts are still loading (or failed to load), and nothing for a class with no semester (it
 * already carries the amber "Chưa chọn học kỳ" badge). */
function AttentionBadges({ cls, attention }: { cls: ClassDTO; attention: ClassAttentionDTO | null }) {
  const { t } = useTranslation();
  if (!attention || !cls.currentPeriodId) return null;
  const badges: Array<{ key: string; text: string; className: string }> = [];
  // Red only for work that is already overdue; students who merely have not handed in a test that
  // is still open get a calm neutral badge (they are counted there only when nothing they owe is
  // overdue, so nobody appears in both).
  if (attention.overdueNotSubmittedStudentCount > 0) {
    badges.push({
      key: 'overdue',
      text: t('teacherHome.attention.overdue', { count: attention.overdueNotSubmittedStudentCount }),
      className: 'bg-red-100 text-red-800',
    });
  }
  if (attention.closingSoonCount > 0) {
    badges.push({
      key: 'closingSoon',
      text: t('teacherHome.attention.closingSoon', { count: attention.closingSoonCount }),
      className: 'bg-amber-100 text-amber-900',
    });
  }
  const stillOpenMissing = attention.notSubmittedStudentCount - attention.overdueNotSubmittedStudentCount;
  if (stillOpenMissing > 0) {
    badges.push({
      key: 'notSubmitted',
      text: t('teacherHome.attention.notSubmitted', { count: stillOpenMissing }),
      className: 'bg-base-black/5 text-base-black/70',
    });
  }
  if (attention.needsGradingCount > 0) {
    badges.push({
      key: 'needsGrading',
      text: t('teacherHome.attention.needsGrading', { count: attention.needsGradingCount }),
      className: 'bg-primary-100 text-primary-800',
    });
  }
  if (attention.speakingNeedsReviewCount > 0) {
    badges.push({
      key: 'speakingNeedsReview',
      text: t('teacherHome.attention.speakingNeedsReview', { count: attention.speakingNeedsReviewCount }),
      className: 'bg-amber-100 text-amber-900',
    });
  }
  if (badges.length === 0) {
    return <p className="text-xs text-base-black/50">{t('teacherHome.attention.none')}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('teacherHome.attention.label')}>
      {badges.map((badge) => (
        <li key={badge.key} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
          {badge.text}
        </li>
      ))}
    </ul>
  );
}

/**
 * Teacher home = the class-card grid (T-102, Phase 13; rewrites T-074/T-095's CRUD list).
 * One card per class — class name, semester badge (amber "Chưa chọn học kỳ" when the class
 * has none yet), what needs attention (small badges from `GET /api/teacher/classes-attention`:
 * students missing an overdue test (red), tests closing soon, students who have not yet
 * submitted a still-open test (calm grey), submissions to grade — only the non-zero ones), student count — and the whole card is a link into that class's workspace
 * (`/teacher/classes/:classId`). Rename / change semester / delete now live in the class's
 * own Cài đặt tab, not here; the only management action on this page is creating a class
 * (name + semester, inline). The semester is preselected (`defaultPeriodId`) so a new class is
 * ready to be given work at once, without a detour through the class's semester switch.
 */
function TeacherClassesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // `null` while loading; `[]` when there are none (or they could not be loaded).
  const [periods, setPeriods] = useState<AcademicPeriodDTO[] | null>(null);
  // The teacher's own pick in the create form; `''` = not touched, so the default applies.
  const [pickedPeriodId, setPickedPeriodId] = useState('');
  // Per-class attention counts; `null` until loaded — the cards simply have no badges then (and
  // stay that way if the request fails: the badges are a bonus, never a reason to break the page).
  const [attention, setAttention] = useState<Map<string, ClassAttentionDTO> | null>(null);

  useEffect(() => {
    teacherApi
      .listClasses()
      .then(setClasses)
      .catch(() => setLoadFailed(true));
    teacherApi
      .listSelectablePeriods()
      .then(setPeriods)
      .catch(() => setPeriods([]));
    teacherApi
      .getClassesAttention()
      .then((response) => setAttention(new Map(response.classes.map((item) => [item.classId, item]))))
      .catch(() => setAttention(null));
  }, []);

  function openCreateForm() {
    setCreating(true);
    setCreateError(null);
  }

  function closeCreateForm() {
    setCreating(false);
    setNewClassName('');
    setPickedPeriodId('');
    setCreateError(null);
  }

  // Resolved lazily so it is right even if the semester list arrives after the form opened.
  const newPeriodId = pickedPeriodId || defaultPeriodId(periods ?? [], classes ?? []);

  async function handleCreateClass(event: FormEvent) {
    event.preventDefault();
    const name = newClassName.trim();
    if (!name) {
      setCreateError(t('teacherHome.validationError'));
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const created = await teacherApi.createClass({
        name,
        ...(newPeriodId ? { currentPeriodId: newPeriodId } : {}),
      });
      setClasses((prev) => [...(prev ?? []), created]);
      closeCreateForm();
    } catch {
      // Always the Vietnamese message: the server's own error text is English.
      setCreateError(t('teacherHome.createFailed'));
    } finally {
      setSaving(false);
    }
  }

  // Filter classes by name
  const filteredClasses = classes
    ? classes.filter((cls) => cls.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageBanner
        size="compact"
        title={t('teacherHome.greeting', { name: user?.name ?? '' })}
        subtitle={t('teacherHome.description')}
      />

      {/* Action & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-700">{t('teacherHome.heading')}</h1>
          <p className="text-xs text-base-black/60">Quản lý và theo dõi tiến độ các lớp học của bạn</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Ô tìm kiếm lớp học */}
          <div className="relative min-w-[240px] sm:w-64">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm theo tên lớp..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 placeholder-slate-400 shadow-xs transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                title="Xóa tìm kiếm"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-95"
          >
            <span className="text-base font-bold">+</span>
            <span>{t('teacherHome.createButton')}</span>
          </button>
        </div>
      </div>

      {/* Modal Popup Tạo Lớp Học */}
      {creating && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={closeCreateForm}
          />

          {/* Modal Dialog */}
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Tạo lớp học mới</h3>
                <p className="text-xs text-slate-500">Nhập tên lớp và chọn học kỳ áp dụng để bắt đầu</p>
              </div>
              <button
                type="button"
                onClick={closeCreateForm}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  {t('teacherHome.nameLabel')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newClassName}
                  onChange={(event) => setNewClassName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') closeCreateForm();
                  }}
                  placeholder={t('teacherHome.namePlaceholder')}
                  autoFocus
                  required
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>

              {periods !== null && periods.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    {t('teacherHome.semesterLabel')}
                  </label>
                  <select
                    value={newPeriodId}
                    onChange={(event) => setPickedPeriodId(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  >
                    {periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">{t('teacherHome.semesterHint')}</p>
                </div>
              )}

              {periods !== null && periods.length === 0 && (
                <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                  {t('teacherHome.noPeriods')}{' '}
                  <Link to="/teacher/curriculum" className="font-semibold text-primary-700 underline">
                    {t('teacherHome.noPeriodsLink')}
                  </Link>
                </p>
              )}

              {createError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                  {createError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={closeCreateForm}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {t('teacherHome.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>{t('teacherHome.creating')}</span>
                    </>
                  ) : (
                    t('teacherHome.createSubmit')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loadFailed && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {t('teacherHome.loadFailed')}
        </p>
      )}
      {classes === null && !loadFailed && (
        <p className="text-sm text-base-black/60">{t('common.loading')}</p>
      )}

      {classes?.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary-200 px-6 py-14 text-center">
          <p className="text-lg font-semibold text-primary-700">{t('teacherHome.empty')}</p>
          <p className="max-w-md text-sm text-base-black/60">{t('teacherHome.emptyHint')}</p>
          <button
            type="button"
            onClick={openCreateForm}
            className="mt-1 rounded-md bg-primary-500 px-4 py-2.5 sm:py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('teacherHome.createButton')}
          </button>
          {/* Phase 15: a first-time teacher lands here with nothing yet — point at the guide. */}
          <Link to="/help" className="py-2 text-base font-medium text-primary-700 underline hover:text-primary-800">
            {t('help.viewGuide')}
          </Link>
        </div>
      )}

      {/* Hiển thị kết quả tìm kiếm rỗng */}
      {classes && classes.length > 0 && filteredClasses?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="mt-3 text-base font-semibold text-slate-800">Không tìm thấy lớp học nào</p>
          <p className="mt-1 text-xs text-slate-500">
            Không có lớp nào khớp với từ khóa "{searchTerm}". Vui lòng thử tìm từ khóa khác.
          </p>
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="mt-3 text-xs font-semibold text-primary-600 hover:underline"
          >
            Xóa bộ lọc
          </button>
        </div>
      )}

      {filteredClasses && filteredClasses.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredClasses.map((cls) => {
            const band = cardBandForClass(cls.id);
            return (
              <li key={cls.id} className="flex">
                <Link
                  to={classTabPath(cls.id)}
                  className="group flex w-full flex-col overflow-hidden rounded-2xl border border-primary-200 bg-base-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                >
                  <div className={`${band.bg} px-5 py-6`}>
                    <h2 className={`line-clamp-2 break-words text-xl font-bold ${band.text}`}>
                      {cls.name}
                    </h2>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    {cls.currentPeriodName ? (
                      <span className="inline-flex self-start rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
                        {cls.currentPeriodName}
                      </span>
                    ) : (
                      <span className="inline-flex self-start rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        {t('teacherHome.noSemester')}
                      </span>
                    )}
                    <AttentionBadges cls={cls} attention={attention?.get(cls.id) ?? null} />
                    <p className="mt-auto text-sm text-base-black/60">
                      {t('teacherHome.studentCount', { count: cls.studentCount })}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default TeacherClassesPage;
