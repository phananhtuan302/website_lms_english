/**
 * Startup environment validation (T-003).
 *
 * Fails fast with a clear, actionable error message if a required environment
 * variable is missing, instead of letting the server boot into a broken state and
 * fail confusingly later (e.g. Prisma throwing an opaque connection error on the
 * first query, minutes after "successful" startup).
 *
 * Keep this list to variables the server *actually* needs right now — add a new
 * required var here in the same change that starts depending on it, don't
 * pre-validate variables nothing reads yet.
 */

interface RequiredVar {
  name: string;
  description: string;
}

const REQUIRED_VARS: RequiredVar[] = [
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string for Prisma. See server/.env.example.',
  },
  {
    name: 'JWT_SECRET',
    description:
      'Secret used to sign/verify auth JWTs (auth lands in T-005). See server/.env.example.',
  },
];

export interface Env {
  PORT: number;
  CLIENT_ORIGIN: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
}

let cached: Env | undefined;

/**
 * Reads and validates `process.env`. Safe to call from multiple modules (e.g. both
 * `index.ts` and `lib/jwt.ts`) — the result is memoized after the first successful
 * call, so validation only runs and only logs once per process. Still exits the
 * process with a clear, human-readable message if anything required is missing or
 * blank, rather than letting the app limp along half-configured. Call it as early as
 * possible from the entry point (after `dotenv/config` has run) so the first call
 * happens before anything else touches `process.env`.
 */
export function loadEnv(): Env {
  if (cached) {
    return cached;
  }

  const missing = REQUIRED_VARS.filter(({ name }) => {
    const value = process.env[name];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    const lines = missing.map(({ name, description }) => `  - ${name}: ${description}`);
    // No logger exists yet at this point in startup — console.error is intentional.
    console.error(
      [
        '',
        '[startup] Missing required environment variable(s):',
        ...lines,
        '',
        'Fix: copy server/.env.example to server/.env and fill in real values, then restart.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  cached = {
    PORT: Number(process.env.PORT) || 5000,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    DATABASE_URL: process.env.DATABASE_URL as string,
    JWT_SECRET: process.env.JWT_SECRET as string,
  };
  return cached;
}
