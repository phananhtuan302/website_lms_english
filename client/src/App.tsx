import { BrowserRouter, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import AttemptResultPage from './pages/AttemptResultPage';
import HomePage from './pages/HomePage';
import JoinPage from './pages/JoinPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import RegisterPage from './pages/RegisterPage';
import StudentDashboardPage from './pages/StudentDashboardPage';
import StudentFlashcardsPage from './pages/StudentFlashcardsPage';
import StudentFlashcardSetPage from './pages/StudentFlashcardSetPage';
import StudentGrammarExercisePage from './pages/StudentGrammarExercisePage';
import StudentGrammarPage from './pages/StudentGrammarPage';
import StudentGrammarSpaceShooterGamePage from './pages/StudentGrammarSpaceShooterGamePage';
import StudentGrammarTopicPage from './pages/StudentGrammarTopicPage';
import StudentPracticeTestsPage from './pages/StudentPracticeTestsPage';
import StudentRunnerGamePage from './pages/StudentRunnerGamePage';
import StudentSpaceShooterGamePage from './pages/StudentSpaceShooterGamePage';
import StudentUnitTestsPage from './pages/StudentUnitTestsPage';
import StudentVocabExercisePage from './pages/StudentVocabExercisePage';
import StudentVocabMatchingPage from './pages/StudentVocabMatchingPage';
import StudentVocabProgressPage from './pages/StudentVocabProgressPage';
import StudentVocabSentencePage from './pages/StudentVocabSentencePage';
import StudentVocabularyChecksPage from './pages/StudentVocabularyChecksPage';
import TakeTestPage from './pages/TakeTestPage';
import TeacherAttemptDetailPage from './pages/TeacherAttemptDetailPage';
import TeacherCurriculumPage from './pages/TeacherCurriculumPage';
import TeacherDashboardPage from './pages/TeacherDashboardPage';
import TeacherFlashcardsPage from './pages/TeacherFlashcardsPage';
import TeacherFlashcardSetEditorPage from './pages/TeacherFlashcardSetEditorPage';
import TeacherFlashcardSetProgressPage from './pages/TeacherFlashcardSetProgressPage';
import TeacherGrammarPage from './pages/TeacherGrammarPage';
import TeacherGrammarReportsPage from './pages/TeacherGrammarReportsPage';
import TeacherGrammarTopicEditorPage from './pages/TeacherGrammarTopicEditorPage';
import TeacherLiveSessionPage from './pages/TeacherLiveSessionPage';
import TeacherReportsHubPage from './pages/TeacherReportsHubPage';
import TeacherSessionAttemptsPage from './pages/TeacherSessionAttemptsPage';
import TeacherTestsPage from './pages/TeacherTestsPage';
import TeacherTestEditorPage from './pages/TeacherTestEditorPage';
import TeacherUnitTestsPage from './pages/TeacherUnitTestsPage';
import TeacherVocabRankingPage from './pages/TeacherVocabRankingPage';
import TeacherVocabularyChecksPage from './pages/TeacherVocabularyChecksPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import UnitLeaderboardPage from './pages/UnitLeaderboardPage';
import VocabLeaderboardPage from './pages/VocabLeaderboardPage';

/**
 * Routing + session provider (T-006). `AuthProvider` wraps everything so `Header` (in
 * `AppShell`) and every page can read the current session via `useAuth`.
 *
 * `/teacher/dashboard` and `/student/dashboard` are placeholder pages proving the
 * route guard works end to end — later tasks (T-008, T-011+) replace their contents,
 * not their route/guard wiring.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            {/* Public join-gate (T-011) — deliberately outside ProtectedRoute; it
                handles the logged-out case itself (see JoinPage's doc comment). */}
            <Route path="/join/:token" element={<JoinPage />} />

            <Route element={<ProtectedRoute allowedRoles={['teacher']} />}>
              <Route path="/teacher/dashboard" element={<TeacherDashboardPage />} />
              <Route path="/teacher/tests" element={<TeacherTestsPage />} />
              <Route path="/teacher/tests/:testId" element={<TeacherTestEditorPage />} />
              <Route path="/teacher/curriculum" element={<TeacherCurriculumPage />} />
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
              {/* Unified reporting area (T-057): module switcher (Test/Unit Test/
                  Vocabulary/Grammar/Speaking) over the same reporting engines each
                  module already used standalone. */}
              <Route path="/teacher/reports" element={<TeacherReportsHubPage />} />
              {/* Vocabulary monthly (T-032) / yearly (T-033) ranking report. */}
              <Route path="/teacher/vocab-ranking" element={<TeacherVocabRankingPage />} />
              {/* Grammar topic authoring: theory content (T-047) + practice exercises
                  (T-048). */}
              <Route path="/teacher/grammar-topics" element={<TeacherGrammarPage />} />
              <Route
                path="/teacher/grammar-topics/:topicId"
                element={<TeacherGrammarTopicEditorPage />}
              />
              {/* Grammar reports (T-050), reusing T-019's engine additively. */}
              <Route path="/teacher/grammar-reports" element={<TeacherGrammarReportsPage />} />
              {/* Unit Test management (T-036): grouped-by-Unit listing of this
                  teacher's own `testType: unitTest` tests. Tagging/publishing a test as
                  a Unit Test happens in the regular test editor above. */}
              <Route path="/teacher/unit-tests" element={<TeacherUnitTestsPage />} />
              {/* Vocabulary Check generation (T-038): pick target student(s), generate,
                  and see previously-generated checks. */}
              <Route path="/teacher/vocabulary-checks" element={<TeacherVocabularyChecksPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route path="/student/dashboard" element={<StudentDashboardPage />} />
              {/* Home self-practice picker (T-040) — starts/resumes a standalone attempt
                  for any test, outside a teacher-run QR/live session. */}
              <Route path="/student/practice" element={<StudentPracticeTestsPage />} />
              <Route path="/student/attempts/:attemptId" element={<TakeTestPage />} />
              <Route path="/student/attempts/:attemptId/result" element={<AttemptResultPage />} />
              <Route path="/student/flashcard-sets" element={<StudentFlashcardsPage />} />
              <Route path="/student/flashcard-sets/:setId" element={<StudentFlashcardSetPage />} />
              {/* Own vocabulary progress across every studied set (T-030). */}
              <Route path="/student/vocab-progress" element={<StudentVocabProgressPage />} />
              <Route
                path="/student/flashcard-sets/:setId/exercises/:exerciseType"
                element={<StudentVocabExercisePage />}
              />
              {/* Matching exercise (T-028), use-in-a-sentence (T-029), and the two vocab
                  games (T-034 space shooter, T-035 runner) — same "generic feature,
                  routed off :setId" shape as the exercise route above. */}
              <Route path="/student/flashcard-sets/:setId/matching" element={<StudentVocabMatchingPage />} />
              <Route path="/student/flashcard-sets/:setId/sentence" element={<StudentVocabSentencePage />} />
              <Route
                path="/student/flashcard-sets/:setId/games/space-shooter"
                element={<StudentSpaceShooterGamePage />}
              />
              <Route path="/student/flashcard-sets/:setId/games/runner" element={<StudentRunnerGamePage />} />

              {/* Grammar: browse topics + read theory (T-047), practice exercises
                  (T-048), and the Grammar game (T-049). */}
              <Route path="/student/grammar-topics" element={<StudentGrammarPage />} />
              <Route path="/student/grammar-topics/:topicId" element={<StudentGrammarTopicPage />} />
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
              <Route path="/student/unit-tests" element={<StudentUnitTestsPage />} />
              {/* Vocabulary Checks assigned to me (T-038) — 15-minute checks generated
                  from vocabulary I've already studied. */}
              <Route path="/student/vocabulary-checks" element={<StudentVocabularyChecksPage />} />
            </Route>

            {/* Vocabulary leaderboard (T-031) — visible to BOTH roles, so it's its own
                route block with both roles allowed, rather than duplicated under
                /teacher and /student. */}
            <Route element={<ProtectedRoute allowedRoles={['teacher', 'student']} />}>
              <Route path="/vocab-leaderboard" element={<VocabLeaderboardPage />} />
              {/* Unit Test report & leaderboard (T-037) — visible to both roles, same
                  "own route block with both roles allowed" pattern as the vocabulary
                  leaderboard above. */}
              <Route path="/units/:unitId/leaderboard" element={<UnitLeaderboardPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
