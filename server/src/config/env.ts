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

/**
 * Reads and validates `process.env`. Call this once, as early as possible in the
 * server's entry point (after `dotenv/config` has run). Exits the process with a
 * clear, human-readable message if anything required is missing or blank, rather
 * than letting the app limp along half-configured.
 */
export function loadEnv(): Env {
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

  return {
    PORT: Number(process.env.PORT) || 4000,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    DATABASE_URL: process.env.DATABASE_URL as string,
    JWT_SECRET: process.env.JWT_SECRET as string,
  };
}
