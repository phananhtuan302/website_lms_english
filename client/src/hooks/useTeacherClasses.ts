import { useEffect, useState } from 'react';
import type { ClassDTO } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';

/**
 * Fetches the calling teacher/admin's own classes (T-074's `GET /api/teacher/classes`)
 * for every teacher-facing leaderboard/report page's new class filter (T-077). Every such
 * page follows the same three-way rule this hook implements once:
 *
 * - 0 classes: `classes` comes back as `[]` — the page shows a "no classes yet" message
 *   and never fires its data request (nothing meaningful to show).
 * - Exactly 1 class: auto-selected into `classId` immediately, no picker shown — per
 *   T-077's documented ambiguity resolution ("no picker needed for a choice that doesn't
 *   exist"). The caller's data-fetch effect can just gate on `classId !== ''`.
 * - 2+ classes: `classId` starts `''` (nothing auto-picked, since picking one for the
 *   teacher would silently hide the other classes' data) until the teacher explicitly
 *   chooses via `ClassFilterControl`.
 *
 * `enabled: false` (e.g. this same page rendered for a `student` viewer, who has no
 * classes of their own to list) skips the request entirely — `GET /api/teacher/classes`
 * is teacher/admin-only and would otherwise just 403 pointlessly.
 */
export function useTeacherClasses(enabled: boolean) {
  const [classes, setClasses] = useState<ClassDTO[] | null>(null);
  const [classId, setClassId] = useState('');

  useEffect(() => {
    // No synchronous `setState` here for the `!enabled` case (e.g. a `student` viewer of
    // the same page) — `classes`/`classId` already default to `null`/`''`, so there is
    // nothing to reset, and calling `setState` directly in an effect body (outside a
    // `.then`/`.catch`) trips the `react-hooks/set-state-in-effect` lint rule.
    if (!enabled) return;
    teacherApi
      .listClasses()
      .then((list) => {
        setClasses(list);
        if (list.length === 1) setClassId(list[0].id);
      })
      .catch(() => setClasses([]));
  }, [enabled]);

  return { classes, classId, setClassId };
}
