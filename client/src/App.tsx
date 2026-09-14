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
import TakeTestPage from './pages/TakeTestPage';
import TeacherAttemptDetailPage from './pages/TeacherAttemptDetailPage';
import TeacherCurriculumPage from './pages/TeacherCurriculumPage';
import TeacherDashboardPage from './pages/TeacherDashboardPage';
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
              <Route
                path="/teacher/sessions/:sessionId/attempts"
                element={<TeacherSessionAttemptsPage />}
              />
              <Route path="/teacher/attempts/:attemptId" element={<TeacherAttemptDetailPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route path="/student/dashboard" element={<StudentDashboardPage />} />
              <Route path="/student/attempts/:attemptId" element={<TakeTestPage />} />
              <Route path="/student/attempts/:attemptId/result" element={<AttemptResultPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
