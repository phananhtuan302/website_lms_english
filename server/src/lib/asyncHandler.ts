/**
 * Wraps an async Express route handler so a rejected promise (e.g. a Prisma call that
 * throws) is forwarded to `next(err)` instead of becoming an unhandled promise
 * rejection.
 *
 * Why this exists (ties into T-061): Express 4 only auto-catches SYNCHRONOUS throws
 * inside a handler. If an `async` handler throws after an `await` (the normal shape
 * for every route in this codebase, which all call `await prisma...`), Express never
 * sees it — the promise just rejects into the void. On modern Node (15+), an unhandled
 * rejection crashes the whole process by default, which is worse than the original
 * QA-reported bug (an HTML stack-trace page): the entire server goes down instead of
 * one request failing. Wrapping every async handler with this closes that gap so the
 * new global error middleware in `index.ts` actually gets a chance to run.
 */

import type { NextFunction, Request, Response } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
