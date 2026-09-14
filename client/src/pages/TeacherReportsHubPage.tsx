import { useState } from 'react';
import { Link } from 'react-router-dom';
import TeacherGrammarReportsPage from './TeacherGrammarReportsPage';
import TeacherReportsPage from './TeacherReportsPage';
import TeacherSpeakingReportsPage from './TeacherSpeakingReportsPage';
import TeacherVocabRankingPage from './TeacherVocabRankingPage';

type ReportModule = 'test' | 'unitTest' | 'vocabulary' | 'grammar' | 'speaking';

const MODULE_TABS: Array<{ value: ReportModule; label: string }> = [
  { value: 'test', label: 'Test' },
  { value: 'unitTest', label: 'Unit Test' },
  { value: 'vocabulary', label: 'Vocabulary' },
  { value: 'grammar', label: 'Grammar' },
  { value: 'speaking', label: 'Speaking' },
];

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
 */
function TeacherReportsHubPage() {
  const [activeModule, setActiveModule] = useState<ReportModule>('test');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">Reports</h1>
        <p className="mt-1 text-sm text-base-black/60">
          One place for every module's reporting. Pick a module, then a period granularity — every
          number below is computed by the same reporting engine used throughout the app.
        </p>
      </div>

      <nav aria-label="Report module" className="flex flex-wrap gap-2 border-b border-primary-200 pb-2">
        {MODULE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveModule(tab.value)}
            className={
              activeModule === tab.value
                ? 'rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white'
                : 'rounded-md border border-primary-200 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50'
            }
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeModule === 'test' && <TeacherReportsPage />}

      {activeModule === 'unitTest' && (
        <TeacherReportsPage
          fixedTestType="unitTest"
          heading="Unit Test reports"
          description="Average score, average time taken, and attempt count across your Unit Tests only, counting only submitted attempts. Choose a granularity below; optionally narrow to one test and/or one unit."
        />
      )}

      {activeModule === 'vocabulary' && (
        <div className="flex flex-col gap-4">
          <TeacherVocabRankingPage />
          <p className="text-sm text-base-black/60">
            Looking for all-time standings instead of one period?{' '}
            <Link to="/vocab-leaderboard" className="font-medium text-primary-700 underline">
              View the all-time vocabulary leaderboard
            </Link>
            .
          </p>
        </div>
      )}

      {activeModule === 'grammar' && <TeacherGrammarReportsPage />}

      {activeModule === 'speaking' && <TeacherSpeakingReportsPage />}
    </div>
  );
}

export default TeacherReportsHubPage;
