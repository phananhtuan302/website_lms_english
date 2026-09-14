import { useEffect, useState } from 'react';
import { APP_NAME, HEALTH_CHECK_PATH, type HealthCheckResponse } from '@platform/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

type ServerStatus = 'checking' | 'online' | 'offline';

const STATUS_STYLES: Record<ServerStatus, string> = {
  checking: 'bg-slate-100 text-slate-600',
  online: 'bg-green-100 text-green-700',
  offline: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<ServerStatus, string> = {
  checking: 'Checking server...',
  online: 'Server online',
  offline: 'Server offline (start it with `npm run dev -w server`)',
};

function App() {
  const [status, setStatus] = useState<ServerStatus>('checking');
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}${HEALTH_CHECK_PATH}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Unexpected status ${res.status}`);
        }
        return res.json() as Promise<HealthCheckResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setHealth(data);
          setStatus('online');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('offline');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-8 text-center">
      <h1 className="text-4xl font-bold text-orange-600">{APP_NAME}</h1>
      <p className="max-w-md text-slate-600">
        Monorepo scaffold: React + TypeScript + Vite + Tailwind CSS on the client, talking to a
        Node.js + Express + Socket.IO server, sharing types through the{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">@platform/shared</code>{' '}
        workspace.
      </p>
      <p className={`rounded-full px-4 py-1 text-sm font-medium ${STATUS_STYLES[status]}`}>
        {STATUS_LABEL[status]}
        {health ? ` — ${health.service} @ ${health.timestamp}` : ''}
      </p>
    </main>
  );
}

export default App;
