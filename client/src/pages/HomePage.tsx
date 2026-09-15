import { Link } from 'react-router-dom';
import { APP_NAME } from '@platform/shared';
import { useAuth } from '../context/useAuth';

interface Highlight {
  title: string;
  description: string;
}

const HIGHLIGHTS: Highlight[] = [
  {
    title: 'Tests & QR check-in',
    description:
      'Teachers author tests with shuffled question variants; students join in class by scanning a QR code or self-practice anytime.',
  },
  {
    title: 'Vocabulary & Grammar',
    description:
      'Flashcards, six exercise types, arcade-style games, and a full Grammar module with theory, practice, and reports.',
  },
  {
    title: 'Speaking, graded',
    description: 'Record spoken answers in-browser and get an instant score and feedback.',
  },
  {
    title: 'Progress for everyone',
    description:
      'Live in-class monitoring for teachers, and reports, rankings, and leaderboards for every module.',
  },
];

/**
 * Real landing page (replaces the original T-001 scaffold placeholder — the plain
 * "Monorepo scaffold: React + TypeScript..." text that was never revisited once actual
 * product pages existed, found 2026-09-15 alongside the Header nav bug: a first-time
 * visitor's very first impression was raw framework/infra copy, not the product). A
 * logged-in visitor gets a "go to your dashboard" shortcut instead of Register/Log in.
 */
function HomePage() {
  const { user } = useAuth();
  const dashboardPath = user?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';

  return (
    <div className="flex flex-col items-center gap-10 py-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-bold text-primary-600 sm:text-5xl">{APP_NAME}</h1>
        <p className="max-w-xl text-lg text-base-black/70">
          Test, learn, and track progress in English — tests with QR check-in, vocabulary and
          grammar practice, and Speaking with instant feedback, all in one place for teachers and
          students.
        </p>

        {user ? (
          <Link
            to={dashboardPath}
            className="rounded-md bg-primary-500 px-6 py-3 text-base font-semibold text-base-white transition-colors hover:bg-primary-600"
          >
            Go to your dashboard
          </Link>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="rounded-md border border-primary-300 bg-base-white px-6 py-3 text-base font-semibold text-primary-700 transition-colors hover:bg-primary-100"
            >
              Create a student account
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary-500 px-6 py-3 text-base font-semibold text-base-white transition-colors hover:bg-primary-600"
            >
              Log in
            </Link>
          </div>
        )}
      </div>

      <dl className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
        {HIGHLIGHTS.map((item) => (
          <div
            key={item.title}
            className="rounded-xl border border-primary-100 bg-primary-50 p-6 text-left"
          >
            <dt className="text-lg font-semibold text-primary-700">{item.title}</dt>
            <dd className="mt-2 text-sm text-base-black/70">{item.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default HomePage;
