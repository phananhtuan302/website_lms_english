import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import { LegacyClassRedirect, TestReportRoute, VocabLeaderboardRoute } from './components/LegacyRedirects';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { AttemptLockProvider } from './context/AttemptLockContext';
import AdminAttemptsPage from './pages/AdminAttemptsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminFlashcardSetsPage from './pages/AdminFlashcardSetsPage';
import AdminGrammarTopicsPage from './pages/AdminGrammarTopicsPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminTestsPage from './pages/AdminTestsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AttemptResultPage from './pages/AttemptResultPage';
import HelpPage from './pages/HelpPage';
import HomePage from './pages/HomePage';
import JoinPage from './pages/JoinPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import RegisterPage from './pages/RegisterPage';
import StudentCalendarPage from './pages/StudentCalendarPage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import StudentFlashcardsPage from './pages/StudentFlashcardsPage';
import StudentFlashcardSetPage from './pages/StudentFlashcardSetPage';
import StudentGradesPage from './pages/StudentGradesPage';
import StudentGrammarExercisePage from './pages/StudentGrammarExercisePage';
import StudentGrammarPage from './pages/StudentGrammarPage';
import StudentGrammarSpaceShooterGamePage from './pages/StudentGrammarSpaceShooterGamePage';
import StudentGrammarTopicPage from './pages/StudentGrammarTopicPage';
import StudentRunnerGamePage from './pages/StudentRunnerGamePage';
import StudentSpaceShooterGamePage from './pages/StudentSpaceShooterGamePage';
import StudentVocabExercisePage from './pages/StudentVocabExercisePage';
import StudentVocabMatchingPage from './pages/StudentVocabMatchingPage';
import StudentVocabProgressPage from './pages/StudentVocabProgressPage';
import StudentVocabSelfCheckPage from './pages/StudentVocabSelfCheckPage';
import StudentVocabSentencePage from './pages/StudentVocabSentencePage';
import TakeTestPage from './pages/TakeTestPage';
import TeacherAttemptDetailPage from './pages/TeacherAttemptDetailPage';
import TeacherClassesPage from './pages/TeacherClassesPage';
import ClassAnnouncementsTab from './pages/classWorkspace/ClassAnnouncementsTab';
import ClassAssignmentsTab from './pages/classWorkspace/ClassAssignmentsTab';
import ClassGradesTab from './pages/classWorkspace/ClassGradesTab';
import ClassOverviewTab from './pages/classWorkspace/ClassOverviewTab';
import ClassSettingsTab from './pages/classWorkspace/ClassSettingsTab';
import ClassStatsTab from './pages/classWorkspace/ClassStatsTab';
import { REPORTS_ENABLED } from './lib/featureFlags';
import ClassStudentsTab from './pages/classWorkspace/ClassStudentsTab';
import ClassUnknownTabRedirect from './pages/classWorkspace/ClassUnknownTabRedirect';
import ClassWorkspaceLayout from './pages/classWorkspace/ClassWorkspaceLayout';
import TeacherLibraryPage from './pages/TeacherLibraryPage';
import TeacherCurriculumPage from './pages/TeacherCurriculumPage';
import TeacherFlashcardsPage from './pages/TeacherFlashcardsPage';
import TeacherFlashcardSetEditorPage from './pages/TeacherFlashcardSetEditorPage';
import TeacherFlashcardSetProgressPage from './pages/TeacherFlashcardSetProgressPage';
import TeacherGradesOverviewPage from './pages/TeacherGradesOverviewPage';
import TeacherGrammarGeneratorPage from './pages/TeacherGrammarGeneratorPage';
import TeacherGrammarPage from './pages/TeacherGrammarPage';
import TeacherGrammarTopicEditorPage from './pages/TeacherGrammarTopicEditorPage';
import TeacherChatPage from './pages/TeacherChatPage';
import TeacherExamImportPage from './pages/TeacherExamImportPage';
import TeacherLiveSessionPage from './pages/TeacherLiveSessionPage';
import TeacherSessionAttemptsPage from './pages/TeacherSessionAttemptsPage';
import TeacherTestAttemptsReportPage from './pages/TeacherTestAttemptsReportPage';
import TeacherTestsPage from './pages/TeacherTestsPage';
import TeacherTestEditorPage from './pages/TeacherTestEditorPage';
import TeacherVocabularyChecksPage from './pages/TeacherVocabularyChecksPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import UnitLeaderboardPage from './pages/UnitLeaderboardPage';
import VocabLeaderboardPage from './pages/VocabLeaderboardPage';

/**
 * Routing + session provider (T-006). `AuthProvider` wraps everything so `Header` (in
 * `AppShell`) and every page can read the current session via `useAuth`.
 *
 * `AttemptLockProvider` (T-091) sits inside `AuthProvider` (needs `user.role`) and
 * wraps `AppShell` so both `Header` (nav/logout) and the routed page content share the
 * same in-progress-attempt lock state and its route-level force-redirect. It needs
 * `useLocation`/`useNavigate`, so it must render inside `BrowserRouter` too.
 *
 * Teachers land on `/teacher/classes` (class-card home; `/teacher/dashboard` and the other
 * pre-Phase-13 teacher URLs only redirect there — T-106); students land on
 * `/student/dashboard` ("Bài cần làm").
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AttemptLockProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />
              {/* Phase 15: "Trợ giúp" — a public guide (teacher or student version by role). */}
              <Route path="/help" element={<HelpPage />} />
              {/* Public join-gate (T-011) — deliberately outside ProtectedRoute; it
                handles the logged-out case itself (see JoinPage's doc comment).
                2026-10: `/join` with no token shows a manual-code entry form first (the
                QR code's own `/join/:token` link skips straight past it). */}
              <Route path="/join/:token" element={<JoinPage />} />
              <Route path="/join" element={<JoinPage />} />

              {/* T-071: `admin` also allowed here — admin reuses these EXACT teacher pages
                (e.g. the test/flashcard-set/grammar-topic editors) to manage ANY
                teacher's content, rather than a parallel admin-only editor UI. The
                server-side ownership checks behind every one of these pages' API calls
                were extended the same way (see `server/src/lib/authz.ts`). */}
              <Route element={<ProtectedRoute allowedRoles={['teacher', 'admin']} />}>
                {/* T-102: the old dashboard is retired — teachers land on the class-card
                  home now; this stays only so old bookmarks/links don't break. */}
                <Route path="/teacher/dashboard" element={<Navigate to="/teacher/classes" replace />} />
                {/* T-106: the scattered pre-Phase-13 pages are gone — each old URL below now
                  redirects into the class workspace (see LegacyRedirects.tsx): to the class named
                  by `?classId=` when there is one, otherwise to the class-card home. */}
                <Route path="/teacher/content" element={<LegacyClassRedirect to="assignments" />} />
                <Route path="/teacher/unit-tests" element={<LegacyClassRedirect to="assignments" />} />
                <Route
                  path="/teacher/vocabulary-checks"
                  element={<LegacyClassRedirect to="vocabularyChecks" />}
                />
                <Route path="/teacher/reports" element={<LegacyClassRedirect to="stats" />} />
                <Route
                  path="/teacher/vocab-ranking"
                  element={<LegacyClassRedirect to="vocabularyStats" />}
                />
                <Route
                  path="/teacher/grammar-reports"
                  element={<LegacyClassRedirect to="grammarStats" />}
                />
                {/* "Thư viện" landing (T-102): four cards leading into the authoring pages. */}
                <Route path="/teacher/library" element={<TeacherLibraryPage />} />
                <Route path="/teacher/tests" element={<TeacherTestsPage />} />
                {/* AI exam-image import (2026-10, feature 3 of the "AI Content Tools"
                  set) — a static path, matched ahead of the `:testId` route below
                  regardless of declaration order. */}
                <Route path="/teacher/tests/import-from-images" element={<TeacherExamImportPage />} />
                <Route path="/teacher/tests/:testId" element={<TeacherTestEditorPage />} />
                {/* Per-test attempt report (T-087): ranked list of every submitted
                  attempt of one test, across all sessions AND self-practice. Drills
                  into the existing `/teacher/attempts/:attemptId` route below. T-106: with
                  `?classId=` it redirects to the class-embedded results page; without it this
                  standalone page (with its own class picker) still works. */}
                <Route
                  path="/teacher/tests/:testId/report"
                  element={
                    <TestReportRoute>
                      <TeacherTestAttemptsReportPage />
                    </TestReportRoute>
                  }
                />
                <Route path="/teacher/curriculum" element={<TeacherCurriculumPage />} />
                {/* Class-card home (T-074 → rewritten in T-102): one card per class, plus
                  inline "+ Tạo lớp". Registration's class picker reads the PUBLIC
                  `/api/classes` list, not this teacher-only page. */}
                <Route path="/teacher/classes" element={<TeacherClassesPage />} />
                {/* Class workspace (T-102): a LAYOUT route — persistent header + tab bar,
                  the class loaded once and handed to every tab via outlet context
                  (`useClassWorkspace`). Later tasks fill the placeholder tabs by replacing
                  each tab's own file (T-103: assignments, T-104: students/grades/stats) and
                  may add more sibling child routes here (e.g. `tests/:testId/results`). */}
                <Route path="/teacher/classes/:classId" element={<ClassWorkspaceLayout />}>
                  <Route index element={<ClassOverviewTab />} />
                  <Route path="announcements" element={<ClassAnnouncementsTab />} />
                  <Route path="assignments" element={<ClassAssignmentsTab />} />
                  {/* T-103: class-embedded pages of the Bài tập tab (the tab bar keeps
                    "Bài tập" lit through `alsoSegments` in lib/classWorkspace.ts). Both read
                    the class from the ROUTE (`:classId`) and fall back to `?classId=` only when
                    rendered standalone. */}
                  <Route path="tests/:testId/results" element={<TeacherTestAttemptsReportPage />} />
                  <Route path="vocabulary-checks" element={<TeacherVocabularyChecksPage />} />
                  <Route path="students" element={<ClassStudentsTab />} />
                  <Route path="grades" element={<ClassGradesTab />} />
                  {/* T-104: `stats/:module` = the Thống kê sub-tab (test / unit-test /
                    vocabulary / grammar / speaking / leaderboard) — see TeacherReportsHubPage. */}
                  {/* Hidden while `REPORTS_ENABLED` is off (lib/featureFlags.ts): the URLs then fall
                    through to the catch-all below, i.e. the class overview. */}
                  {REPORTS_ENABLED && <Route path="stats" element={<ClassStatsTab />} />}
                  {REPORTS_ENABLED && <Route path="stats/:module" element={<ClassStatsTab />} />}
                  <Route path="settings" element={<ClassSettingsTab />} />
                  <Route path="*" element={<ClassUnknownTabRedirect />} />
                </Route>
                <Route path="/teacher/flashcard-sets" element={<TeacherFlashcardsPage />} />
                <Route
                  path="/teacher/flashcard-sets/:setId"
                  element={<TeacherFlashcardSetEditorPage />}
                />
                {/* Per-student/per-class vocabulary progress for one owned set (T-030). */}
                <Route
                  path="/teacher/flashcard-sets/:setId/progress"
                  element={<TeacherFlashcardSetProgressPage />}
                />
                <Route
                  path="/teacher/sessions/:sessionId/attempts"
                  element={<TeacherSessionAttemptsPage />}
                />
                <Route
                  path="/teacher/sessions/:sessionId/live"
                  element={<TeacherLiveSessionPage />}
                />
                <Route path="/teacher/attempts/:attemptId" element={<TeacherAttemptDetailPage />} />
                {/* Teacher-level score comparison across classes (Phase 17, T-118B), reached
                  from the "Điểm số" tab's "Xem so sánh với các lớp khác →" link. */}
                <Route path="/teacher/grades-overview" element={<TeacherGradesOverviewPage />} />
                {/* Teacher AI chat assistant (2026-10, feature 4 of the "AI Content
                  Tools" set). */}
                <Route path="/teacher/chat" element={<TeacherChatPage />} />
                {/* Grammar topic authoring: theory content (T-047) + practice exercises
                  (T-048). */}
                <Route path="/teacher/grammar-topics" element={<TeacherGrammarPage />} />
                {/* AI grammar lesson generation (2026-10, feature 2 of the "AI Content
                  Tools" set) — a static path, so it's matched ahead of the
                  `:topicId` route below regardless of declaration order. */}
                <Route path="/teacher/grammar-topics/generate" element={<TeacherGrammarGeneratorPage />} />
                <Route
                  path="/teacher/grammar-topics/:topicId"
                  element={<TeacherGrammarTopicEditorPage />}
                />
              </Route>

              {/* Admin-only role/auth foundation (T-069), user management (T-070), and
                content-oversight "browse everything" lists (T-071). Actually editing one
                specific Test/Flashcard set/Grammar topic happens on the teacher routes
                above (now admin-accessible too), not here. */}
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/tests" element={<AdminTestsPage />} />
                <Route path="/admin/flashcard-sets" element={<AdminFlashcardSetsPage />} />
                <Route path="/admin/grammar-topics" element={<AdminGrammarTopicsPage />} />
                {/* Scores/attempts management (T-072a): system-wide attempt browse +
                  delete. Drilling into one attempt reuses the teacher route above
                  (`/teacher/attempts/:attemptId`, already admin-accessible). */}
                <Route path="/admin/attempts" element={<AdminAttemptsPage />} />
                {/* Site-wide language Settings page (T-072b) — the ONLY place in the
                  product that can change the language everyone sees. */}
                <Route path="/admin/settings" element={<AdminSettingsPage />} />
              </Route>

              <Route element={<ProtectedRoute allowedRoles={['student']} />}>
                <Route path="/student/dashboard" element={<StudentDashboardPage />} />
                <Route path="/student/grades" element={<StudentGradesPage />} />
                <Route path="/student/calendar" element={<StudentCalendarPage />} />
                {/* Home self-practice picker (T-040) — starts/resumes a standalone attempt
                  for any test, outside a teacher-run QR/live session. */}
                <Route path="/student/practice" element={<Navigate to="/student/dashboard" replace />} />
                <Route path="/student/attempts/:attemptId" element={<TakeTestPage />} />
                <Route path="/student/attempts/:attemptId/result" element={<AttemptResultPage />} />
                <Route path="/student/flashcard-sets" element={<StudentFlashcardsPage />} />
                <Route
                  path="/student/flashcard-sets/:setId"
                  element={<StudentFlashcardSetPage />}
                />
                {/* Own vocabulary progress across every studied set (T-030). */}
                <Route path="/student/vocab-progress" element={<StudentVocabProgressPage />} />
                <Route
                  path="/student/flashcard-sets/:setId/exercises/:exerciseType"
                  element={<StudentVocabExercisePage />}
                />
                {/* Matching exercise (T-028), use-in-a-sentence (T-029), and the two vocab
                  games (T-034 space shooter, T-035 runner) — same "generic feature,
                  routed off :setId" shape as the exercise route above. */}
                <Route
                  path="/student/flashcard-sets/:setId/matching"
                  element={<StudentVocabMatchingPage />}
                />
                <Route
                  path="/student/flashcard-sets/:setId/sentence"
                  element={<StudentVocabSentencePage />}
                />
                <Route
                  path="/student/flashcard-sets/:setId/games/space-shooter"
                  element={<StudentSpaceShooterGamePage />}
                />
                <Route
                  path="/student/flashcard-sets/:setId/games/runner"
                  element={<StudentRunnerGamePage />}
                />
                {/* "Tự kiểm tra" self-check quiz (T-089) — a completely different,
                  student-initiated feature from the unrelated teacher-assigned "Kiểm tra
                  từ vựng" (Vocabulary Check) route mounted separately below. */}
                <Route
                  path="/student/flashcard-sets/:setId/self-check"
                  element={<StudentVocabSelfCheckPage />}
                />

                {/* Grammar: browse topics + read theory (T-047), practice exercises
                  (T-048), and the Grammar game (T-049). */}
                <Route path="/student/grammar-topics" element={<StudentGrammarPage />} />
                <Route
                  path="/student/grammar-topics/:topicId"
                  element={<StudentGrammarTopicPage />}
                />
                <Route
                  path="/student/grammar-topics/:topicId/practice"
                  element={<StudentGrammarExercisePage />}
                />
                <Route
                  path="/student/grammar-topics/:topicId/games/space-shooter"
                  element={<StudentGrammarSpaceShooterGamePage />}
                />

                {/* Unit Tests I can take (T-036) — grouped by curriculum unit, gated by
                  `Test.published`. "Take"/"Resume" reuse the self-practice start
                  endpoint, same as `/student/practice`. */}
                <Route path="/student/unit-tests" element={<Navigate to="/student/dashboard" replace />} />
                {/* Vocabulary Checks assigned to me (T-038) — 15-minute checks generated
                  from vocabulary I've already studied. */}
                <Route
                  path="/student/vocabulary-checks"
                  element={<Navigate to="/student/dashboard" replace />}
                />
              </Route>

              {/* Vocabulary leaderboard (T-031) — visible to BOTH roles, so it's its own
                route block with both roles allowed, rather than duplicated under
                /teacher and /student. */}
              <Route element={<ProtectedRoute allowedRoles={['teacher', 'student']} />}>
                {/* T-106: the teacher's view redirects into the class workspace's Thống kê
                  tab; students keep this page. */}
                <Route
                  path="/vocab-leaderboard"
                  element={
                    <VocabLeaderboardRoute>
                      <VocabLeaderboardPage />
                    </VocabLeaderboardRoute>
                  }
                />
                {/* Unit Test report & leaderboard (T-037) — visible to both roles, same
                  "own route block with both roles allowed" pattern as the vocabulary
                  leaderboard above. */}
                <Route path="/units/:unitId/leaderboard" element={<UnitLeaderboardPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppShell>
        </AttemptLockProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
