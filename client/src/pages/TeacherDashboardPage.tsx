import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';

/**
 * Teacher-only landing page (T-006), reachable only via the `/teacher/dashboard` route
 * guarded by `ProtectedRoute allowedRoles={['teacher']}`.
 *
 * T-094: previously one flat wall of ~10 links, which the customer found cluttered and
 * unclear about which class an action applied to. Restructured (navigation/labeling
 * only — every link below is unchanged, same `to=`/behavior as before) into two
 * sections modeled on how Google Classroom/Canvas separate "authoring" from "a class's
 * own workspace": "Thư viện của tôi" (content authored once, not tied to a class) vs.
 * "Lớp học của tôi" (everything scoped to operating within a specific class). The top
 * nav bar's own per-item links were removed in the same task — this page is now the one
 * place all of them live.
 */
function TeacherDashboardPage() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-primary-100 bg-primary-50 p-8">
        <h1 className="text-2xl font-bold text-primary-700">{t('teacherDashboard.heading')}</h1>
        <p className="mt-2 text-base-black/70">
          {t('teacherDashboard.welcome', { name: user?.name })}
        </p>
        <button
          type="button"
          onClick={logout}
          className="mt-6 rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          {t('common.logOut')}
        </button>
      </div>

      <section className="rounded-xl border border-primary-200 p-6">
        <h2 className="text-lg font-bold text-base-black">{t('teacherDashboard.libraryHeading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherDashboard.librarySubtitle')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/teacher/tests"
            className="inline-block rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('teacherDashboard.manageTests')}
          </Link>
          <Link
            to="/teacher/flashcard-sets"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.manageFlashcards')}
          </Link>
          <Link
            to="/teacher/grammar-topics"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.manageGrammar')}
          </Link>
          <Link
            to="/teacher/curriculum"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.manageCurriculum')}
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-primary-200 p-6">
        <h2 className="text-lg font-bold text-base-black">{t('teacherDashboard.classWorkspaceHeading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('teacherDashboard.classWorkspaceSubtitle')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/teacher/classes"
            className="inline-block rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            {t('teacherDashboard.manageClasses')}
          </Link>
          <Link
            to="/teacher/content"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.manageContent')}
          </Link>
          <Link
            to="/teacher/reports"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.viewReports')}
          </Link>
          <Link
            to="/vocab-leaderboard"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.vocabLeaderboard')}
          </Link>
          <Link
            to="/teacher/unit-tests"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.unitTests')}
          </Link>
          <Link
            to="/teacher/vocabulary-checks"
            className="inline-block rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            {t('teacherDashboard.vocabularyCheck')}
          </Link>
        </div>
      </section>
    </div>
  );
}

export default TeacherDashboardPage;
