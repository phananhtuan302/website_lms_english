import { PrismaClient } from '@prisma/client';

/**
 * Single shared Prisma client for the whole server process.
 *
 * Kept as a plain module-level singleton (not per-request) — Prisma manages its own
 * connection pool internally, so creating one `PrismaClient` per import and reusing it
 * is the documented pattern. `tsx watch` restarts the whole process on file change, so
 * there is no dev-only hot-reload duplication concern here (that pattern matters for
 * frameworks that hot-swap modules without restarting the process, e.g. Next.js).
 */
export const prisma = new PrismaClient();
