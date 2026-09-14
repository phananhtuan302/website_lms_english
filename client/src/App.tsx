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
import StudentRunnerGamePage from './pages/StudentRunnerGamePage';
import StudentSpaceShooterGamePage from './pages/StudentSpaceShooterGamePage';
import StudentVocabExercisePage from './pages/StudentVocabExercisePage';
import StudentVocabMatchingPage from './pages/StudentVocabMatchingPage';
import StudentVocabSentencePage from './pages/StudentVocabSentencePage';
import TakeTestPage from './pages/TakeTestPage';
import TeacherAttemptDetailPage from './pages/TeacherAttemptDetailPage';
import TeacherCurriculumPage from './pages/TeacherCurriculumPage';
import TeacherDashboardPage from './pages/TeacherDashboardPage';
import TeacherFlashcardsPage from './pages/TeacherFlashcardsPage';
import TeacherFlashcardSetEditorPage from './pages/TeacherFlashcardSetEditorPage';
import TeacherLiveSessionPage from './pages/TeacherLiveSessionPage';
import TeacherReportsPage from './pages/TeacherReportsPage';
import TeacherSessionAttemptsPage from './pages/TeacherSessionAttemptsPage';
import TeacherTestsPage from './pages/TeacherTestsPage';
import TeacherTestEditorPage from './pages/TeacherTestEditorPage';
import UnauthorizedPage from './pages/UnauthorizedPage';

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
              <Route
                path="/teacher/sessions/:sessionId/attempts"
                element={<TeacherSessionAttemptsPage />}
              />
              <Route
                path="/teacher/sessions/:sessionId/live"
                element={<TeacherLiveSessionPage />}
              />
              <Route path="/teacher/attempts/:attemptId" element={<TeacherAttemptDetailPage />} />
              <Route path="/teacher/reports" element={<TeacherReportsPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route path="/student/dashboard" element={<StudentDashboardPage />} />
              <Route path="/student/attempts/:attemptId" element={<TakeTestPage />} />
              <Route path="/student/attempts/:attemptId/result" element={<AttemptResultPage />} />
              <Route path="/student/flashcard-sets" element={<StudentFlashcardsPage />} />
              <Route path="/student/flashcard-sets/:setId" element={<StudentFlashcardSetPage />} />
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
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
