import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useClassScope } from '../hooks/useClassScope';
import { classTabPath } from '../lib/classWorkspace';
import TeacherGrammarReportsPage from './TeacherGrammarReportsPage';
import TeacherReportsPage from './TeacherReportsPage';
import TeacherSpeakingReportsPage from './TeacherSpeakingReportsPage';
import TeacherVocabRankingPage from './TeacherVocabRankingPage';
import VocabLeaderboardPage from './VocabLeaderboardPage';

type ReportModule = 'test' | 'unitTest' | 'vocabulary' | 'grammar' | 'speaking' | 'leaderboard';

/** `slug` is the sub-route segment used when the hub is embedded in the class workspace
 * (`/teacher/classes/:classId/stats/:slug`, T-104). */
interface ModuleTab {
  value: ReportModule;
  slug: string;
  labelKey: string;
}

const MODULE_TABS: ModuleTab[] = [
  { value: 'test', slug: 'test', labelKey: 'teacherReportsHub.tabs.test' },
  { value: 'unitTest', slug: 'unit-test', labelKey: 'teacherReportsHub.tabs.unitTest' },
  { value: 'vocabulary', slug: 'vocabulary', labelKey: 'teacherReportsHub.tabs.vocabulary' },
  { value: 'grammar', slug: 'grammar', labelKey: 'teacherReportsHub.tabs.grammar' },
  { value: 'speaking', slug: 'speaking', labelKey: 'teacherReportsHub.tabs.speaking' },
];

/** T-104: only offered inside the class workspace — the standalone hub keeps linking to the
 * separate `/vocab-leaderboard` page from its Vocabulary tab, exactly as before. */
const LEADERBOARD_TAB: ModuleTab = {
  value: 'leaderboard',
  slug: 'leaderboard',
  labelKey: 'classStats.leaderboardTab',
};

/**
 * T-057 — single teacher-facing reporting area: one page, one module switcher, every
 * module's numbers built on its own already-working engine (`computeReport` for
 * Test/Unit Test, `computeGrammarReport` for Grammar, the vocab-ranking engine for
 * Vocabulary, and the new `computeSpeakingReport` for Speaking — see
 * `server/src/lib/reporting.ts`) rather than a redesign or a one-off per-module
 * implementation. Each tab below simply renders the existing, already-correct
 * module-specific report component inline — no logic is duplicated here, this file is
 * purely the consolidation layer the backlog asked for.
 *
 * "Test" reuses `TeacherReportsPage` with no fixed test type (an optional Test-type
 * filter is available inside it); "Unit Test" reuses the exact same component with
 * `fixedTestType="unitTest"` locked in, narrowing to `Test.testType: 'unitTest'` via the
 * same `computeReport` engine field T-037 already added. Deep links to each module's
 * previous standalone route (`/teacher/vocab-ranking`, `/teacher/grammar-reports`) still
 * work unchanged — this hub is additive, not a replacement of those routes.
 *
 * T-104: also rendered EMBEDDED in the class workspace's "Thống kê" tab
 * (`/teacher/classes/:classId/stats/:module?`). Embedded (detected from the route's
 * `:classId` param, see `useClassScope`), the class is locked to that class (each module page
 * reads the same route param), the active module lives in the URL (so refresh/back keep the
 * sub-tab), the page's own title block is dropped (the workspace header + tab already say
 * where you are), and a sixth "Xếp hạng từ vựng" module renders the vocabulary leaderboard.
 * Standalone (`/teacher/reports`) is unchanged: local state, five modules.
 */
function TeacherReportsHubPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isEmbedded, initialClassId: routeClassId } = useClassScope();
  const { module: moduleParam } = useParams<{ module: string }>();
  const [localModule, setLocalModule] = useState<ReportModule>('test');

  const tabs = isEmbedded ? [...MODULE_TABS, LEADERBOARD_TAB] : MODULE_TABS;
  const activeModule: ReportModule = isEmbedded
    ? (tabs.find((tab) => tab.slug === moduleParam)?.value ?? 'test')
    : localModule;

  const selectModule = (tab: ModuleTab) => {
    if (isEmbedded) navigate(classTabPath(routeClassId, `stats/${tab.slug}`));
    else setLocalModule(tab.value);
  };

  return (
    <div className="flex flex-col gap-6">
      {isEmbedded ? (
        <p className="text-sm text-base-black/60">{t('classStats.description')}</p>
      ) : (
        <div>
          <h1 className="text-2xl font-bold text-primary-700">{t('teacherReportsHub.heading')}</h1>
          <p className="mt-1 text-sm text-base-black/60">{t('teacherReportsHub.description')}</p>
        </div>
      )}

      <nav
        aria-label={t('teacherReportsHub.navAriaLabel')}
        className="flex flex-wrap gap-2 border-b border-primary-200 pb-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => selectModule(tab)}
            aria-current={activeModule === tab.value ? 'page' : undefined}
            className={
              activeModule === tab.value
                ? 'rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white'
                : 'rounded-md border border-primary-200 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50'
            }
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      {activeModule === 'test' && <TeacherReportsPage />}

      {activeModule === 'unitTest' && (
        <TeacherReportsPage
          fixedTestType="unitTest"
          heading={t('teacherReportsHub.unitTest.heading')}
          description={t('teacherReportsHub.unitTest.description')}
        />
      )}

      {activeModule === 'vocabulary' && (
        <div className="flex flex-col gap-4">
          <TeacherVocabRankingPage />
          <p className="text-sm text-base-black/60">
            {t('teacherReportsHub.vocabulary.leaderboardPrompt')}{' '}
            <Link
              to={isEmbedded ? classTabPath(routeClassId, 'stats/leaderboard') : '/vocab-leaderboard'}
              className="font-medium text-primary-700 underline"
            >
              {t('teacherReportsHub.vocabulary.leaderboardLink')}
            </Link>
            .
          </p>
        </div>
      )}

      {activeModule === 'grammar' && <TeacherGrammarReportsPage />}

      {activeModule === 'speaking' && <TeacherSpeakingReportsPage />}

      {activeModule === 'leaderboard' && <VocabLeaderboardPage />}
    </div>
  );
}

export default TeacherReportsHubPage;
