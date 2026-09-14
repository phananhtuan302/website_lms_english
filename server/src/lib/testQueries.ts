/**
 * The one shared "fetch a test with its full nested content" query, used by test
 * authoring (T-008), variant generation (T-009), and now the attempt endpoints
 * (T-011–T-014). Pulled out of `teacherTests.routes.ts` (which used to declare this
 * privately) so the take-test/grading/result code paths query a test exactly the same
 * way authoring does, instead of a second, potentially-drifting copy of the same
 * `include`.
 */

import { prisma } from './prisma';

export const NESTED_TEST_INCLUDE = {
  sections: {
    orderBy: { order: 'asc' as const },
    include: {
      questions: {
        orderBy: { order: 'asc' as const },
        include: { choices: { orderBy: { order: 'asc' as const } } },
      },
    },
  },
  // Curriculum tag (T-018) — just id+name, enough for the editor to display the tagged
  // Unit's name without a second round-trip. `unitId` itself is already a plain scalar
  // column on `Test` and needs no `include` to come back.
  unit: { select: { id: true, name: true } },
};

export type NestedTest = Awaited<ReturnType<typeof fetchNestedTest>>;

export function fetchNestedTest(testId: string) {
  return prisma.test.findUniqueOrThrow({ where: { id: testId }, include: NESTED_TEST_INCLUDE });
}
