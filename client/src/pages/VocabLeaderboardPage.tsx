import { useEffect, useState } from 'react';
import type { VocabLeaderboardResponseDTO } from '@platform/shared';
import { vocabLeaderboardApi } from '../lib/vocabLeaderboardApi';
import { ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';

/**
 * Vocabulary leaderboard (T-031) — visible to both roles (see `App.tsx`'s route
 * wiring, which mounts this same page under a `ProtectedRoute` allowing BOTH
 * `teacher` and `student`). Score formula documented in
 * `server/src/lib/vocabLeaderboard.ts`: exercise accuracy (0-100) plus 10 points per
 * card at `known` status.
 */
function VocabLeaderboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<VocabLeaderboardResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vocabLeaderboardApi
      .getLeaderboard()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load leaderboard.'));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-700">Vocabulary leaderboard</h1>
        <p className="mt-1 text-sm text-base-black/60">
          Ranked by score = exercise accuracy (%) + 10 points per card known. All-time standings
          across every student.
        </p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !data && <p className="text-sm text-base-black/60">Loading...</p>}

      {data && (
        <section className="overflow-x-auto rounded-xl border border-primary-200">
          <table className="min-w-full divide-y divide-primary-100 text-sm">
            <thead className="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-700">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Cards known</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Accuracy</th>
                <th className="px-4 py-3">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-base-black/60">
                    No students yet.
                  </td>
                </tr>
              )}
              {data.entries.map((entry) => (
                <tr
                  key={entry.studentId}
                  className={entry.studentId === user?.id ? 'bg-primary-50 font-semibold' : ''}
                >
                  <td className="px-4 py-3 text-base-black">#{entry.rank}</td>
                  <td className="px-4 py-3 text-base-black">
                    {entry.studentName}
                    {entry.studentId === user?.id && <span className="ml-2 text-xs text-primary-600">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-base-black/80">{entry.knownCardCount}</td>
                  <td className="px-4 py-3 text-base-black/80">
                    {entry.correctAttempts}/{entry.totalAttempts}
                  </td>
                  <td className="px-4 py-3 text-base-black/80">
                    {entry.accuracyPercent === null ? '—' : `${entry.accuracyPercent}%`}
                  </td>
                  <td className="px-4 py-3 font-semibold text-primary-700">{entry.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default VocabLeaderboardPage;
