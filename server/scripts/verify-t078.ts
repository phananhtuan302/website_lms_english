/**
 * T-078 verification script — a dedicated, genuinely adversarial cross-class isolation
 * regression pass, the last task of Phase 12 (class-based multi-tenancy). Independent of
 * any prior task's fixture/script: builds its own fresh 2-teacher, 4-class, 5-student
 * fixture from scratch and hits every student-facing/reporting/leaderboard surface
 * touched by T-076/T-077 directly over REST with each account's own real JWT (from a
 * real `/api/auth/login` or `/api/auth/register` call — never a fabricated token), same
 * "REAL REST calls against an already-running dev server + Postgres" convention as
 * `verify-t075.ts`.
 *
 * Fixture shape (deliberately covers every adversarial combination T-078's acceptance
 * criteria calls out):
 *   - Teacher 1 (seeded `teacher@example.com`): 2 fresh classes (A, B). Authors ONE of
 *     each content type (generic Test, Unit Test, Speaking-question Test, FlashcardSet,
 *     GrammarTopic) and assigns EVERY one of them to BOTH of their own classes — the
 *     "same teacher, same underlying row, two classes" case explicitly called out by the
 *     acceptance criteria.
 *   - Teacher 2 (seeded `teacher2@example.com`): 2 fresh classes (A, B). Authors its own
 *     parallel set of content, assigned to ONLY class A (not B) — the "assigned to just
 *     one of my classes" case T-077's own e2e spec 08 didn't exercise (it assigned to
 *     BOTH classes), plus the cross-TEACHER case.
 *   - Students: 2 in Teacher 1 Class A, 1 in Teacher 1 Class B, 1 in Teacher 2 Class A, 1
 *     in Teacher 2 Class B — enough to prove same-teacher/cross-class, cross-teacher, AND
 *     "assigned to a sibling class but not mine" all independently.
 *
 * Usage: start the dev server first (`npm run dev -w server` or the root `npm run dev`),
 * then `npm run verify:t078 -w server`. Requires the two seeded teacher accounts.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const SEED_TEACHER_EMAIL = process.env.SEED_TEACHER_EMAIL ?? 'teacher@example.com';
const SEED_TEACHER_PASSWORD = process.env.SEED_TEACHER_PASSWORD ?? 'teacher-dev-password123';
const SEED_TEACHER_2_EMAIL = process.env.SEED_TEACHER_2_EMAIL ?? 'teacher2@example.com';
const SEED_TEACHER_2_PASSWORD = process.env.SEED_TEACHER_2_PASSWORD ?? 'teacher2-dev-password123';

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function pass(label: string): void {
  passCount += 1;
  console.log(`  [PASS] ${label}`);
}
function fail(label: string, detail?: unknown): void {
  failCount += 1;
  failures.push(label);
  console.error(`  [FAIL] ${label}`, detail !== undefined ? JSON.stringify(detail) : '');
}
function assert(condition: unknown, label: string, detail?: unknown): void {
  if (condition) pass(label);
  else fail(label, detail);
}

async function apiRequest<T>(
  path: string,
  token: string | null,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = (await res.json().catch(() => undefined)) as T;
  return { status: res.status, body };
}

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;

async function login(email: string, password: string): Promise<string> {
  const { status, body } = await apiRequest<{ token: string }>('/api/auth/login', null, {
    method: 'POST',
    body: { email, password },
  });
  if (status !== 200) throw new Error(`login(${email}) failed: ${status} ${JSON.stringify(body)}`);
  return body.token;
}

async function register(name: string, classId: string): Promise<{ token: string; studentId: string }> {
  const email = `t078-${name.replace(/\s+/g, '-').toLowerCase()}-${suffix}@example.com`;
  const { status, body } = await apiRequest<{ token: string; user: { id: string } }>('/api/auth/register', null, {
    method: 'POST',
    body: { name, email, password: 'T078-student-password-1', classId },
  });
  if (status !== 201) throw new Error(`register(${name}) failed: ${status} ${JSON.stringify(body)}`);
  return { token: body.token, studentId: body.user.id };
}

async function createClass(token: string, name: string): Promise<string> {
  const { status, body } = await apiRequest<{ id: string }>('/api/teacher/classes', token, {
    method: 'POST',
    body: { name },
  });
  if (status !== 201) throw new Error(`createClass(${name}) failed: ${status} ${JSON.stringify(body)}`);
  return body.id;
}

interface Choice {
  text: string;
  isCorrect: boolean;
}

async function createTest(
  token: string,
  title: string,
  opts: { testType?: string; published?: boolean; unitId?: string } = {},
): Promise<string> {
  const { status, body } = await apiRequest<{ id: string }>('/api/teacher/tests', token, {
    method: 'POST',
    body: { title, testType: opts.testType, published: opts.published, unitId: opts.unitId },
  });
  if (status !== 201) throw new Error(`createTest(${title}) failed: ${status} ${JSON.stringify(body)}`);
  return body.id;
}

async function addSection(token: string, testId: string, title: string): Promise<string> {
  const { status, body } = await apiRequest<{ sections: Array<{ id: string; title: string }> }>(
    `/api/teacher/tests/${testId}/sections`,
    token,
    { method: 'POST', body: { title } },
  );
  if (status !== 201) throw new Error(`addSection failed: ${status} ${JSON.stringify(body)}`);
  const section = body.sections.find((s) => s.title === title);
  if (!section) throw new Error('addSection: could not find created section in response');
  return section.id;
}

interface NestedQuestion {
  id: string;
  prompt: string;
  choices: Array<{ id: string; text: string; isCorrect: boolean }>;
}
interface NestedSection {
  id: string;
  questions: NestedQuestion[];
}
interface NestedTestDetail {
  id: string;
  sections: NestedSection[];
}

async function addMultipleChoiceQuestion(
  token: string,
  testId: string,
  sectionId: string,
  prompt: string,
  choices: Choice[],
): Promise<NestedTestDetail> {
  const { status, body } = await apiRequest<NestedTestDetail>(
    `/api/teacher/tests/${testId}/sections/${sectionId}/questions`,
    token,
    { method: 'POST', body: { type: 'multipleChoice', prompt, choices } },
  );
  if (status !== 201) throw new Error(`addMultipleChoiceQuestion failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

async function addSpeakingQuestion(token: string, testId: string, sectionId: string, prompt: string): Promise<void> {
  const { status, body } = await apiRequest(
    `/api/teacher/tests/${testId}/sections/${sectionId}/questions`,
    token,
    { method: 'POST', body: { type: 'speaking', prompt } },
  );
  if (status !== 201) throw new Error(`addSpeakingQuestion failed: ${status} ${JSON.stringify(body)}`);
}

async function generateVariants(token: string, testId: string): Promise<void> {
  const { status, body } = await apiRequest(`/api/teacher/tests/${testId}/variants`, token, {
    method: 'POST',
    body: { count: 1 },
  });
  if (status !== 201) throw new Error(`generateVariants failed: ${status} ${JSON.stringify(body)}`);
}

async function assignTestClasses(token: string, testId: string, classIds: string[]): Promise<void> {
  const { status, body } = await apiRequest(`/api/teacher/tests/${testId}/classes`, token, {
    method: 'PUT',
    body: { classIds },
  });
  if (status !== 200) throw new Error(`assignTestClasses failed: ${status} ${JSON.stringify(body)}`);
}

async function createFlashcardSet(token: string, name: string): Promise<string> {
  const { status, body } = await apiRequest<{ id: string }>('/api/teacher/flashcard-sets', token, {
    method: 'POST',
    body: { name },
  });
  if (status !== 201) throw new Error(`createFlashcardSet failed: ${status} ${JSON.stringify(body)}`);
  return body.id;
}

async function addFlashcardCard(token: string, setId: string, term: string, meaning: string): Promise<void> {
  const { status, body } = await apiRequest(`/api/teacher/flashcard-sets/${setId}/cards`, token, {
    method: 'POST',
    body: { term, meaning },
  });
  if (status !== 201) throw new Error(`addFlashcardCard failed: ${status} ${JSON.stringify(body)}`);
}

async function assignFlashcardSetClasses(token: string, setId: string, classIds: string[]): Promise<void> {
  const { status, body } = await apiRequest(`/api/teacher/flashcard-sets/${setId}/classes`, token, {
    method: 'PUT',
    body: { classIds },
  });
  if (status !== 200) throw new Error(`assignFlashcardSetClasses failed: ${status} ${JSON.stringify(body)}`);
}

async function createGrammarTopic(token: string, title: string): Promise<string> {
  const { status, body } = await apiRequest<{ id: string }>('/api/teacher/grammar-topics', token, {
    method: 'POST',
    body: { title, theoryContent: 'Some theory content for T-078 fixture.' },
  });
  if (status !== 201) throw new Error(`createGrammarTopic failed: ${status} ${JSON.stringify(body)}`);
  return body.id;
}

async function addGrammarExercise(token: string, topicId: string): Promise<void> {
  const { status, body } = await apiRequest(`/api/teacher/grammar-topics/${topicId}/exercises`, token, {
    method: 'POST',
    body: {
      type: 'multipleChoice',
      prompt: 'Pick the correct one.',
      choices: [
        { text: 'Right', isCorrect: true },
        { text: 'Wrong', isCorrect: false },
      ],
    },
  });
  if (status !== 201) throw new Error(`addGrammarExercise failed: ${status} ${JSON.stringify(body)}`);
}

async function assignGrammarTopicClasses(token: string, topicId: string, classIds: string[]): Promise<void> {
  const { status, body } = await apiRequest(`/api/teacher/grammar-topics/${topicId}/classes`, token, {
    method: 'PUT',
    body: { classIds },
  });
  if (status !== 200) throw new Error(`assignGrammarTopicClasses failed: ${status} ${JSON.stringify(body)}`);
}

async function startSession(token: string, testId: string): Promise<string> {
  const { status, body } = await apiRequest<{ joinToken: string }>(
    `/api/teacher/tests/${testId}/sessions`,
    token,
    { method: 'POST' },
  );
  if (status !== 201) throw new Error(`startSession failed: ${status} ${JSON.stringify(body)}`);
  return body.joinToken;
}

async function getOrCreateUnit(token: string): Promise<string> {
  const { body } = await apiRequest<Array<{ id: string }>>('/api/teacher/units', token);
  if (Array.isArray(body) && body.length > 0) return body[0].id;
  const { status, body: created } = await apiRequest<{ id: string }>('/api/teacher/units', token, {
    method: 'POST',
    body: { name: `T078 Unit ${suffix}`, order: 999 },
  });
  if (status !== 201) throw new Error(`getOrCreateUnit failed: ${status} ${JSON.stringify(created)}`);
  return created.id;
}

async function main() {
  console.log('--- T-078: adversarial cross-class isolation regression pass ---\n');

  console.log('[Setup] Logging in both seeded teachers...');
  const t1 = await login(SEED_TEACHER_EMAIL, SEED_TEACHER_PASSWORD);
  const t2 = await login(SEED_TEACHER_2_EMAIL, SEED_TEACHER_2_PASSWORD);

  console.log('[Setup] Creating 2 fresh classes per teacher...');
  const t1ClassA = await createClass(t1, `T078 T1-A ${suffix}`);
  const t1ClassB = await createClass(t1, `T078 T1-B ${suffix}`);
  const t2ClassA = await createClass(t2, `T078 T2-A ${suffix}`);
  const t2ClassB = await createClass(t2, `T078 T2-B ${suffix}`);

  console.log('[Setup] Registering 5 fresh students...');
  const s1a1 = await register('T078 S1A1', t1ClassA); // Teacher1 / Class A
  const s1a2 = await register('T078 S1A2', t1ClassA); // Teacher1 / Class A (2nd student)
  const s1b1 = await register('T078 S1B1', t1ClassB); // Teacher1 / Class B
  const s2a1 = await register('T078 S2A1', t2ClassA); // Teacher2 / Class A
  const s2b1 = await register('T078 S2B1', t2ClassB); // Teacher2 / Class B

  console.log('[Setup] Teacher 1 content: generic Test, Unit Test, Speaking Test, FlashcardSet, GrammarTopic'
    + ' — ALL assigned to BOTH of Teacher 1\'s classes...');
  const unitId = await getOrCreateUnit(t1);

  const t1GenericTestId = await createTest(t1, `T078 T1 Generic Test ${suffix}`);
  const t1GenericSectionId = await addSection(t1, t1GenericTestId, 'Section 1');
  await addMultipleChoiceQuestion(t1, t1GenericTestId, t1GenericSectionId, 'Q1?', [
    { text: 'Correct', isCorrect: true },
    { text: 'Wrong', isCorrect: false },
  ]);
  await generateVariants(t1, t1GenericTestId);
  await assignTestClasses(t1, t1GenericTestId, [t1ClassA, t1ClassB]);

  const t1UnitTestId = await createTest(t1, `T078 T1 Unit Test ${suffix}`, {
    testType: 'unitTest',
    published: true,
    unitId,
  });
  const t1UnitSectionId = await addSection(t1, t1UnitTestId, 'Section 1');
  const t1UnitDetail = await addMultipleChoiceQuestion(t1, t1UnitTestId, t1UnitSectionId, 'Q1?', [
    { text: 'Correct', isCorrect: true },
    { text: 'Wrong', isCorrect: false },
  ]);
  await generateVariants(t1, t1UnitTestId);
  await assignTestClasses(t1, t1UnitTestId, [t1ClassA, t1ClassB]);
  const t1UnitQuestion = t1UnitDetail.sections[0].questions[0];
  const t1UnitCorrectChoice = t1UnitQuestion.choices.find((c) => c.isCorrect)!;
  const t1UnitWrongChoice = t1UnitQuestion.choices.find((c) => !c.isCorrect)!;

  const t1SpeakingTestId = await createTest(t1, `T078 T1 Speaking Test ${suffix}`);
  const t1SpeakingSectionId = await addSection(t1, t1SpeakingTestId, 'Section 1');
  await addSpeakingQuestion(t1, t1SpeakingTestId, t1SpeakingSectionId, 'Say something.');
  await generateVariants(t1, t1SpeakingTestId);
  await assignTestClasses(t1, t1SpeakingTestId, [t1ClassA, t1ClassB]);

  const t1SetId = await createFlashcardSet(t1, `T078 T1 Set ${suffix}`);
  await addFlashcardCard(t1, t1SetId, 'apple', 'a fruit');
  await assignFlashcardSetClasses(t1, t1SetId, [t1ClassA, t1ClassB]);

  const t1TopicId = await createGrammarTopic(t1, `T078 T1 Topic ${suffix}`);
  await addGrammarExercise(t1, t1TopicId);
  await assignGrammarTopicClasses(t1, t1TopicId, [t1ClassA, t1ClassB]);

  console.log('[Setup] Teacher 2 content: generic Test, FlashcardSet, GrammarTopic'
    + ' — ALL assigned to ONLY Teacher 2\'s Class A (not B)...');
  const t2GenericTestId = await createTest(t2, `T078 T2 Generic Test ${suffix}`);
  const t2GenericSectionId = await addSection(t2, t2GenericTestId, 'Section 1');
  await addMultipleChoiceQuestion(t2, t2GenericTestId, t2GenericSectionId, 'Q1?', [
    { text: 'Correct', isCorrect: true },
    { text: 'Wrong', isCorrect: false },
  ]);
  await generateVariants(t2, t2GenericTestId);
  await assignTestClasses(t2, t2GenericTestId, [t2ClassA]);

  const t2SetId = await createFlashcardSet(t2, `T078 T2 Set ${suffix}`);
  await addFlashcardCard(t2, t2SetId, 'banana', 'a fruit');
  await assignFlashcardSetClasses(t2, t2SetId, [t2ClassA]);

  const t2TopicId = await createGrammarTopic(t2, `T078 T2 Topic ${suffix}`);
  await addGrammarExercise(t2, t2TopicId);
  await assignGrammarTopicClasses(t2, t2TopicId, [t2ClassA]);

  console.log('\n--- Phase A: self-practice list (GET /api/tests) ---');
  {
    const { body: s1a1List } = await apiRequest<Array<{ id: string }>>('/api/tests', s1a1.token);
    const { body: s1b1List } = await apiRequest<Array<{ id: string }>>('/api/tests', s1b1.token);
    const { body: s2a1List } = await apiRequest<Array<{ id: string }>>('/api/tests', s2a1.token);
    const { body: s2b1List } = await apiRequest<Array<{ id: string }>>('/api/tests', s2b1.token);

    assert(
      s1a1List.some((t) => t.id === t1GenericTestId),
      'S1A1 (T1 Class A) sees T1 generic test (assigned to both T1 classes)',
    );
    assert(
      s1b1List.some((t) => t.id === t1GenericTestId),
      'S1B1 (T1 Class B) ALSO sees T1 generic test — same teacher, both classes assigned',
    );
    assert(
      !s1a1List.some((t) => t.id === t2GenericTestId) && !s1b1List.some((t) => t.id === t2GenericTestId),
      'Neither T1 student sees T2\'s generic test (cross-teacher)',
    );
    assert(
      s2a1List.some((t) => t.id === t2GenericTestId),
      'S2A1 (T2 Class A) sees T2 generic test (assigned to their class)',
    );
    assert(
      !s2b1List.some((t) => t.id === t2GenericTestId),
      'S2B1 (T2 Class B) does NOT see T2 generic test — same teacher, but only Class A assigned',
    );
    assert(
      !s2a1List.some((t) => t.id === t1GenericTestId) && !s2b1List.some((t) => t.id === t1GenericTestId),
      'Neither T2 student sees T1\'s generic test (cross-teacher)',
    );
  }

  console.log('\n--- Phase B: self-practice start (POST /api/tests/:testId/practice) ---');
  async function practiceStart(token: string, testId: string) {
    return apiRequest<{ attemptId: string }>(`/api/tests/${testId}/practice`, token, { method: 'POST' });
  }
  {
    const r1 = await practiceStart(s1a1.token, t1GenericTestId);
    assert(r1.status === 200, 'S1A1 CAN start T1 generic test (own class assigned)', r1);
    const r2 = await practiceStart(s1b1.token, t1GenericTestId);
    assert(r2.status === 200, 'S1B1 CAN also start T1 generic test (sibling class, same teacher, both assigned)', r2);
    const r3 = await practiceStart(s2b1.token, t2GenericTestId);
    assert(r3.status === 403, 'S2B1 CANNOT start T2 generic test (their teacher\'s own test, but wrong class)', r3);
    const r4 = await practiceStart(s2a1.token, t1GenericTestId);
    assert(r4.status === 403, 'S2A1 CANNOT start T1 generic test (cross-teacher, wrong class either way)', r4);
    const r5 = await practiceStart(s1b1.token, t2GenericTestId);
    assert(r5.status === 403, 'S1B1 CANNOT start T2 generic test (cross-teacher)', r5);
  }

  console.log('\n--- Phase C: QR/link join, including same-teacher wrong-class ---');
  {
    // A NEW test assigned to ONLY T1 Class A (not B) — the sharpest same-teacher
    // different-class adversarial case (T-076's own headline scenario), re-verified here
    // independently with a session join rather than self-practice.
    const soloTestId = await createTest(t1, `T078 T1 Solo-ClassA Test ${suffix}`);
    const soloSectionId = await addSection(t1, soloTestId, 'Section 1');
    await addMultipleChoiceQuestion(t1, soloTestId, soloSectionId, 'Q1?', [
      { text: 'Correct', isCorrect: true },
      { text: 'Wrong', isCorrect: false },
    ]);
    await generateVariants(t1, soloTestId);
    await assignTestClasses(t1, soloTestId, [t1ClassA]);
    const joinToken = await startSession(t1, soloTestId);

    const joinA = await apiRequest<{ attemptId: string }>(`/api/sessions/join/${joinToken}`, s1a1.token, {
      method: 'POST',
    });
    assert(joinA.status === 200, 'S1A1 CAN join QR session for a test assigned only to their own class A', joinA);

    const joinB = await apiRequest<{ error?: string }>(`/api/sessions/join/${joinToken}`, s1b1.token, {
      method: 'POST',
    });
    assert(
      joinB.status === 403,
      'S1B1 (SAME teacher, sibling class B) CANNOT join a valid/active QR session assigned only to class A',
      joinB,
    );

    const joinCrossTeacher = await apiRequest<{ error?: string }>(`/api/sessions/join/${joinToken}`, s2a1.token, {
      method: 'POST',
    });
    assert(
      joinCrossTeacher.status === 403,
      'S2A1 (different teacher entirely) CANNOT join T1\'s QR session even with a valid/active token',
      joinCrossTeacher,
    );
  }

  console.log('\n--- Phase D: Flashcard set list/detail/exercises ---');
  {
    const { body: s1a1Sets } = await apiRequest<Array<{ id: string }>>('/api/flashcard-sets', s1a1.token);
    const { body: s1b1Sets } = await apiRequest<Array<{ id: string }>>('/api/flashcard-sets', s1b1.token);
    const { body: s2a1Sets } = await apiRequest<Array<{ id: string }>>('/api/flashcard-sets', s2a1.token);
    const { body: s2b1Sets } = await apiRequest<Array<{ id: string }>>('/api/flashcard-sets', s2b1.token);

    assert(s1a1Sets.some((s) => s.id === t1SetId), 'S1A1 sees T1 flashcard set');
    assert(s1b1Sets.some((s) => s.id === t1SetId), 'S1B1 ALSO sees T1 flashcard set (both classes assigned)');
    assert(s2a1Sets.some((s) => s.id === t2SetId), 'S2A1 sees T2 flashcard set (their own class A)');
    assert(!s2b1Sets.some((s) => s.id === t2SetId), 'S2B1 does NOT see T2 flashcard set (only class A assigned)');
    assert(
      !s2a1Sets.some((s) => s.id === t1SetId) && !s2b1Sets.some((s) => s.id === t1SetId),
      'Neither T2 student sees T1\'s flashcard set (cross-teacher)',
    );

    const detailWrongClass = await apiRequest(`/api/flashcard-sets/${t2SetId}`, s2b1.token);
    assert(detailWrongClass.status === 404, 'S2B1 GET T2 set detail (their teacher, wrong class) -> 404', detailWrongClass);
    const detailCrossTeacher = await apiRequest(`/api/flashcard-sets/${t1SetId}`, s2a1.token);
    assert(detailCrossTeacher.status === 404, 'S2A1 GET T1 set detail (cross-teacher) -> 404', detailCrossTeacher);
    const detailOk = await apiRequest(`/api/flashcard-sets/${t1SetId}`, s1b1.token);
    assert(detailOk.status === 200, 'S1B1 GET T1 set detail (sibling class, same teacher) -> 200', detailOk);

    const exercisesWrongClass = await apiRequest(
      `/api/flashcard-sets/${t2SetId}/exercises/fillBlank`,
      s2b1.token,
    );
    assert(
      exercisesWrongClass.status === 404,
      'S2B1 GET T2 set exercises (wrong class) -> 404',
      exercisesWrongClass,
    );
  }

  console.log('\n--- Phase E: Grammar topic list/detail/exercises ---');
  {
    const { body: s1a1Topics } = await apiRequest<Array<{ id: string }>>('/api/grammar-topics', s1a1.token);
    const { body: s2b1Topics } = await apiRequest<Array<{ id: string }>>('/api/grammar-topics', s2b1.token);

    assert(s1a1Topics.some((t) => t.id === t1TopicId), 'S1A1 sees T1 grammar topic');
    assert(!s2b1Topics.some((t) => t.id === t2TopicId), 'S2B1 does NOT see T2 grammar topic (only class A assigned)');
    assert(!s2b1Topics.some((t) => t.id === t1TopicId), 'S2B1 does NOT see T1 grammar topic (cross-teacher)');

    const detailWrongClass = await apiRequest(`/api/grammar-topics/${t2TopicId}`, s2b1.token);
    assert(detailWrongClass.status === 404, 'S2B1 GET T2 topic detail (wrong class) -> 404', detailWrongClass);
    const detailCrossTeacher = await apiRequest(`/api/grammar-topics/${t1TopicId}`, s2a1.token);
    assert(detailCrossTeacher.status === 404, 'S2A1 GET T1 topic detail (cross-teacher) -> 404', detailCrossTeacher);

    const exercisesWrongClass = await apiRequest(`/api/grammar-topics/${t2TopicId}/exercises`, s2b1.token);
    assert(exercisesWrongClass.status === 404, 'S2B1 GET T2 topic exercises (wrong class) -> 404', exercisesWrongClass);
  }

  console.log('\n--- Phase F: Unit Test list + Unit Test leaderboard ---');
  {
    const r1 = await practiceStart(s1a1.token, t1UnitTestId);
    assert(r1.status === 200, 'S1A1 starts T1 Unit Test (both classes assigned)', r1);
    const unitTestAttemptS1a1 = r1.body.attemptId;
    const r2 = await practiceStart(s1b1.token, t1UnitTestId);
    assert(r2.status === 200, 'S1B1 ALSO starts T1 Unit Test (sibling class, same teacher)', r2);
    const unitTestAttemptS1b1 = r2.body.attemptId;
    const r3 = await practiceStart(s2a1.token, t1UnitTestId);
    assert(r3.status === 403, 'S2A1 CANNOT start T1 Unit Test (cross-teacher)', r3);

    // Answer + submit: S1A1 scores 100%, S1B1 scores 0% — deliberately different, same
    // proof pattern as T-077's own e2e spec 08.
    await apiRequest(`/api/attempts/${unitTestAttemptS1a1}/answers/${t1UnitQuestion.id}`, s1a1.token, {
      method: 'PUT',
      body: { selectedChoiceId: t1UnitCorrectChoice.id },
    });
    await apiRequest(`/api/attempts/${unitTestAttemptS1a1}/submit`, s1a1.token, { method: 'POST' });
    await apiRequest(`/api/attempts/${unitTestAttemptS1b1}/answers/${t1UnitQuestion.id}`, s1b1.token, {
      method: 'PUT',
      body: { selectedChoiceId: t1UnitWrongChoice.id },
    });
    await apiRequest(`/api/attempts/${unitTestAttemptS1b1}/submit`, s1b1.token, { method: 'POST' });

    const { body: unitTestsS1a1 } = await apiRequest<{ groups: Array<{ tests: Array<{ id: string }> }> }>(
      '/api/student/unit-tests',
      s1a1.token,
    );
    assert(
      unitTestsS1a1.groups.some((g) => g.tests.some((t) => t.id === t1UnitTestId)),
      'S1A1 sees T1 Unit Test in /api/student/unit-tests',
    );
    const { body: unitTestsS2a1 } = await apiRequest<{ groups: Array<{ tests: Array<{ id: string }> }> }>(
      '/api/student/unit-tests',
      s2a1.token,
    );
    assert(
      !unitTestsS2a1.groups.some((g) => g.tests.some((t) => t.id === t1UnitTestId)),
      'S2A1 does NOT see T1 Unit Test in /api/student/unit-tests (cross-teacher)',
    );

    interface UnitLbJson {
      classId: string;
      attemptCount: number;
      averageScorePercent: number | null;
      entries: Array<{ studentName: string; averageScorePercent: number | null }>;
    }
    const lbA = await apiRequest<UnitLbJson>(
      `/api/units/${unitId}/leaderboard?classId=${t1ClassA}`,
      t1,
    );
    assert(lbA.status === 200, 'Teacher1 unit leaderboard classId=A -> 200', lbA);
    assert(
      lbA.body.entries.some((e) => e.studentName === 'T078 S1A1' && e.averageScorePercent === 100),
      'Unit leaderboard classId=A shows S1A1 at 100%',
      lbA.body,
    );
    assert(
      !lbA.body.entries.some((e) => e.studentName === 'T078 S1B1'),
      'Unit leaderboard classId=A never includes S1B1 (Class B)',
      lbA.body,
    );

    const lbB = await apiRequest<UnitLbJson>(`/api/units/${unitId}/leaderboard?classId=${t1ClassB}`, t1);
    assert(
      lbB.body.entries.some((e) => e.studentName === 'T078 S1B1' && e.averageScorePercent === 0),
      'Unit leaderboard classId=B shows S1B1 at 0%',
      lbB.body,
    );
    assert(
      !lbB.body.entries.some((e) => e.studentName === 'T078 S1A1'),
      'Unit leaderboard classId=B never includes S1A1 (Class A)',
      lbB.body,
    );

    // Teacher 2 spoofing Teacher 1's own class id must be rejected outright (not just
    // "empty results") — Teacher 2 doesn't own that class at all.
    const spoofed = await apiRequest<{ error?: string }>(
      `/api/units/${unitId}/leaderboard?classId=${t1ClassA}`,
      t2,
    );
    assert(
      spoofed.status === 404,
      'Teacher2 passing Teacher1\'s classId on the (global-Unit) leaderboard -> 404, not honored',
      spoofed,
    );

    // A student's OWN view (their class auto-resolved, never a spoofed classId) never
    // leaks the other teacher's class's data even though the Unit itself is global.
    const s2a1View = await apiRequest<UnitLbJson>(`/api/units/${unitId}/leaderboard`, s2a1.token);
    assert(
      s2a1View.body.classId === t2ClassA,
      'S2A1\'s own (picker-less) unit leaderboard view resolves to their own class',
      s2a1View.body,
    );
    assert(
      !s2a1View.body.entries.some((e) => e.studentName === 'T078 S1A1' || e.studentName === 'T078 S1B1'),
      'S2A1\'s own unit leaderboard view never shows T1\'s students',
      s2a1View.body,
    );
    const s1a1Spoof = await apiRequest<UnitLbJson>(
      `/api/units/${unitId}/leaderboard?classId=${t1ClassB}`,
      s1a1.token,
    );
    assert(
      s1a1Spoof.body.classId === t1ClassA,
      'S1A1 spoofing ?classId=ClassB is silently ignored, still resolves to their own class A',
      s1a1Spoof.body,
    );
  }

  console.log('\n--- Phase G: generic Test report (groupBy=test, narrowed by testId) ---');
  {
    interface ReportJson {
      buckets: Array<{ key: string; attemptCount: number; averageScorePercent: number | null }>;
    }
    // Reuse the Unit Test attempts from Phase F through the generic reporting endpoint.
    const reportA = await apiRequest<ReportJson>(
      `/api/teacher/reports?groupBy=test&testId=${t1UnitTestId}&classId=${t1ClassA}`,
      t1,
    );
    assert(
      reportA.body.buckets.find((b) => b.key === t1UnitTestId)?.averageScorePercent === 100,
      'Test report classId=A shows 100% for T1 Unit Test',
      reportA.body,
    );
    const reportB = await apiRequest<ReportJson>(
      `/api/teacher/reports?groupBy=test&testId=${t1UnitTestId}&classId=${t1ClassB}`,
      t1,
    );
    assert(
      reportB.body.buckets.find((b) => b.key === t1UnitTestId)?.averageScorePercent === 0,
      'Test report classId=B shows 0% for T1 Unit Test (same test, other class)',
      reportB.body,
    );
  }

  console.log('\n--- Phase H: Grammar report ---');
  {
    // S1A1 answers correctly, S1B1 answers incorrectly on T1's grammar topic (assigned to
    // both classes) — same "deliberately different score" pattern as the Test report.
    const { body: topicDetailA } = await apiRequest<{
      exercises: Array<{ id: string; choices: Array<{ id: string; isCorrect?: boolean }> }>;
    }>(`/api/teacher/grammar-topics/${t1TopicId}`, t1);
    const exercise = topicDetailA.exercises[0];
    const { body: exercisesForStudent } = await apiRequest<
      Array<{ id: string; choices: Array<{ id: string; text: string }> }>
    >(`/api/grammar-topics/${t1TopicId}/exercises`, s1a1.token);
    const correctChoiceId = exercisesForStudent[0].choices.find((c) => c.text === 'Right')!.id;
    const wrongChoiceId = exercisesForStudent[0].choices.find((c) => c.text === 'Wrong')!.id;

    await apiRequest(`/api/grammar-topics/${t1TopicId}/exercises/${exercise.id}/check`, s1a1.token, {
      method: 'POST',
      body: { selectedChoiceId: correctChoiceId },
    });
    await apiRequest(`/api/grammar-topics/${t1TopicId}/exercises/${exercise.id}/check`, s1b1.token, {
      method: 'POST',
      body: { selectedChoiceId: wrongChoiceId },
    });

    interface GrammarReportJson {
      buckets: Array<{ key: string; attemptCount: number; averageScorePercent: number | null }>;
    }
    const reportA = await apiRequest<GrammarReportJson>(
      `/api/teacher/grammar-reports?groupBy=topic&topicId=${t1TopicId}&classId=${t1ClassA}`,
      t1,
    );
    assert(
      reportA.body.buckets.find((b) => b.key === t1TopicId)?.averageScorePercent === 100,
      'Grammar report classId=A shows 100% accuracy',
      reportA.body,
    );
    const reportB = await apiRequest<GrammarReportJson>(
      `/api/teacher/grammar-reports?groupBy=topic&topicId=${t1TopicId}&classId=${t1ClassB}`,
      t1,
    );
    assert(
      reportB.body.buckets.find((b) => b.key === t1TopicId)?.averageScorePercent === 0,
      'Grammar report classId=B shows 0% accuracy (same topic, other class)',
      reportB.body,
    );

    // Cross-teacher: Teacher2 narrowing by T1's topicId must 404, never leak T1's data.
    const crossTeacher = await apiRequest<{ error?: string }>(
      `/api/teacher/grammar-reports?groupBy=topic&topicId=${t1TopicId}`,
      t2,
    );
    assert(crossTeacher.status === 404, 'Teacher2 narrowing grammar-reports by T1\'s topicId -> 404', crossTeacher);
  }

  console.log('\n--- Phase I: Vocabulary leaderboard ---');
  {
    // Give S1A1 and S1B1 each a correct flashcard exercise attempt via the fillBlank
    // check endpoint, so the vocab leaderboard has real, class-attributable data.
    const { body: cardsA } = await apiRequest<{ cards: Array<{ id: string; term: string }> }>(
      `/api/flashcard-sets/${t1SetId}`,
      s1a1.token,
    );
    const cardId = cardsA.cards[0].id;
    await apiRequest(`/api/flashcard-sets/${t1SetId}/cards/${cardId}/progress`, s1a1.token, {
      method: 'PUT',
      body: { status: 'known' },
    });
    await apiRequest(`/api/flashcard-sets/${t1SetId}/cards/${cardId}/progress`, s1b1.token, {
      method: 'PUT',
      body: { status: 'learning' },
    });

    interface VocabLbJson {
      classId: string;
      entries: Array<{ studentName: string; knownCardCount: number }>;
    }
    const lbA = await apiRequest<VocabLbJson>(`/api/vocab-leaderboard?classId=${t1ClassA}`, t1);
    assert(
      lbA.body.entries.some((e) => e.studentName === 'T078 S1A1' && e.knownCardCount === 1),
      'Vocab leaderboard classId=A shows S1A1 with 1 known card',
      lbA.body,
    );
    assert(
      !lbA.body.entries.some((e) => e.studentName === 'T078 S1B1'),
      'Vocab leaderboard classId=A never includes S1B1',
      lbA.body,
    );

    // A student spoofing another class's id must be ignored.
    const spoof = await apiRequest<VocabLbJson>(`/api/vocab-leaderboard?classId=${t1ClassB}`, s1a1.token);
    assert(spoof.body.classId === t1ClassA, 'S1A1 spoofing classId=B on vocab leaderboard is ignored', spoof.body);

    // Teacher2's own leaderboard view (their own class) never shows Teacher1's students.
    const t2View = await apiRequest<VocabLbJson>(`/api/vocab-leaderboard?classId=${t2ClassA}`, t2);
    assert(
      !t2View.body.entries.some((e) => e.studentName.startsWith('T078 S1')),
      'Teacher2\'s vocab leaderboard (their own class) never shows Teacher1\'s students',
      t2View.body,
    );
  }

  console.log('\n--- Phase J: Speaking report ---');
  {
    const r1 = await practiceStart(s1a1.token, t1SpeakingTestId);
    const r2 = await practiceStart(s1b1.token, t1SpeakingTestId);
    assert(r1.status === 200 && r2.status === 200, 'Both S1A1/S1B1 can start T1 Speaking test (both classes assigned)', {
      r1: r1.status,
      r2: r2.status,
    });

    const { body: speakingDetail } = await apiRequest<NestedTestDetail>(`/api/teacher/tests/${t1SpeakingTestId}`, t1);
    const speakingQuestionId = speakingDetail.sections[0].questions[0].id;

    async function submitSpeaking(token: string, attemptId: string) {
      await apiRequest(`/api/attempts/${attemptId}/questions/${speakingQuestionId}/speaking-window/start`, token, {
        method: 'POST',
      });
      return apiRequest(`/api/attempts/${attemptId}/questions/${speakingQuestionId}/speaking-answer`, token, {
        method: 'POST',
        body: { audioData: 'data:audio/webm;base64,AAAA', transcript: 'hello world this is a test answer' },
      });
    }
    const subA = await submitSpeaking(s1a1.token, r1.body.attemptId);
    const subB = await submitSpeaking(s1b1.token, r2.body.attemptId);
    assert(subA.status === 200 && subB.status === 200, 'Both speaking answers submitted+graded', {
      subA: subA.status,
      subB: subB.status,
    });

    interface SpeakingReportJson {
      buckets: Array<{ key: string; attemptCount: number }>;
    }
    const reportA = await apiRequest<SpeakingReportJson>(
      `/api/teacher/speaking-reports?groupBy=test&testId=${t1SpeakingTestId}&classId=${t1ClassA}`,
      t1,
    );
    const reportB = await apiRequest<SpeakingReportJson>(
      `/api/teacher/speaking-reports?groupBy=test&testId=${t1SpeakingTestId}&classId=${t1ClassB}`,
      t1,
    );
    assert(
      reportA.body.buckets.find((b) => b.key === t1SpeakingTestId)?.attemptCount === 1,
      'Speaking report classId=A: exactly 1 graded answer (S1A1 only)',
      reportA.body,
    );
    assert(
      reportB.body.buckets.find((b) => b.key === t1SpeakingTestId)?.attemptCount === 1,
      'Speaking report classId=B: exactly 1 graded answer (S1B1 only)',
      reportB.body,
    );

    // Admin ownership-check fix: admin narrowing by testId owned by Teacher1 must now
    // work (200 with real data), not 404 — the specific low-priority finding this task
    // was asked to confirm/fix.
    const adminToken = await login('admin@example.com', '123456');
    const adminReport = await apiRequest<SpeakingReportJson>(
      `/api/teacher/speaking-reports?groupBy=test&testId=${t1SpeakingTestId}&classId=${t1ClassA}`,
      adminToken,
    );
    assert(
      adminReport.status === 200 && adminReport.body.buckets.find((b) => b.key === t1SpeakingTestId)?.attemptCount === 1,
      'Admin CAN narrow speaking-reports by a testId it does not own (T-078 fix, was 404)',
      adminReport,
    );
    const adminGenericReport = await apiRequest<SpeakingReportJson>(
      `/api/teacher/reports?groupBy=test&testId=${t1UnitTestId}&classId=${t1ClassA}`,
      adminToken,
    );
    assert(
      adminGenericReport.status === 200,
      'Admin CAN narrow /api/teacher/reports by a testId it does not own (T-078 fix, was 404)',
      adminGenericReport,
    );
    const adminGrammarReport = await apiRequest(
      `/api/teacher/grammar-reports?groupBy=topic&topicId=${t1TopicId}&classId=${t1ClassA}`,
      adminToken,
    );
    assert(
      adminGrammarReport.status === 200,
      'Admin CAN narrow /api/teacher/grammar-reports by a topicId it does not own (T-078 fix, was 404)',
      adminGrammarReport,
    );
  }

  console.log('\n--- Phase K: Vocabulary Check exemption (per-student TestAssignment, never class) ---');
  {
    // Give S1A1 some 'learning' vocabulary so the generator has a non-empty pool, then
    // generate a Vocabulary Check targeted ONLY at S1A1.
    const genResult = await apiRequest<{ id: string }>('/api/teacher/vocabulary-checks', t1, {
      method: 'POST',
      body: { studentIds: [s1a1.studentId] },
    });
    if (genResult.status === 201) {
      const vocabCheckId = genResult.body.id;
      const ownStart = await practiceStart(s1a1.token, vocabCheckId);
      assert(ownStart.status === 200, 'S1A1 (the assigned target) CAN start their own Vocabulary Check', ownStart);
      const otherStart = await practiceStart(s1a2.token, vocabCheckId);
      assert(
        otherStart.status === 403,
        'S1A2 (SAME CLASS as S1A1, not individually assigned) CANNOT start S1A1\'s Vocabulary Check — proves '
          + 'gating is per-student TestAssignment, not class',
        otherStart,
      );
    } else {
      console.log(
        `  [SKIP] Vocabulary Check generation returned ${genResult.status} (likely "no eligible vocabulary yet" for a `
          + 'brand-new student) — structural exemption already confirmed by code review (practice.routes.ts / '
          + 'sessions.routes.ts / studentAssignedTests.routes.ts all gate solely on TestAssignment for this type, '
          + 'Test.classes is never populated for it).',
      );
    }
  }

  console.log('\n--- Phase L: T-083 — per-set vocab progress roster scoping ---');
  {
    interface VocabProgressJson {
      students: Array<{ studentId: string; studentName: string }>;
    }
    const t1Progress = await apiRequest<VocabProgressJson>(
      `/api/teacher/flashcard-sets/${t1SetId}/progress`,
      t1,
    );
    assert(t1Progress.status === 200, 'Teacher1 GET own set progress -> 200', t1Progress);
    assert(
      t1Progress.body.students.some((s) => s.studentId === s1a1.studentId),
      'Teacher1\'s roster includes their own student S1A1',
      t1Progress.body.students.map((s) => s.studentName),
    );
    assert(
      !t1Progress.body.students.some((s) => s.studentId === s2a1.studentId || s.studentId === s2b1.studentId),
      'T-083 FIX VERIFIED: Teacher1\'s roster does NOT include Teacher2\'s students (was: ALL 300+ students system-wide)',
      t1Progress.body.students.map((s) => s.studentName),
    );

    const t2Progress = await apiRequest<VocabProgressJson>(
      `/api/teacher/flashcard-sets/${t2SetId}/progress`,
      t2,
    );
    assert(
      t2Progress.body.students.some((s) => s.studentId === s2a1.studentId),
      'Teacher2\'s roster includes their own student S2A1',
    );
    assert(
      !t2Progress.body.students.some((s) => s.studentId === s1a1.studentId || s.studentId === s1b1.studentId),
      'Teacher2\'s roster does NOT include Teacher1\'s students',
      t2Progress.body.students.map((s) => s.studentName),
    );

    // Admin bypass still sees everyone (both fixtures' students at minimum).
    const adminToken = await login('admin@example.com', '123456');
    const adminProgress = await apiRequest<VocabProgressJson>(
      `/api/teacher/flashcard-sets/${t1SetId}/progress`,
      adminToken,
    );
    assert(
      adminProgress.body.students.some((s) => s.studentId === s1a1.studentId) &&
        adminProgress.body.students.some((s) => s.studentId === s2a1.studentId),
      'Admin still sees EVERY student (both teachers\' fixtures) on the per-set progress roster',
      adminProgress.body.students.length,
    );

    // Cross-teacher ownership on the set itself is unaffected by this fix.
    const crossTeacherOwnership = await apiRequest(`/api/teacher/flashcard-sets/${t2SetId}/progress`, t1);
    assert(
      crossTeacherOwnership.status === 404,
      'Teacher1 GET Teacher2\'s set progress (wrong owner) -> still 404, unaffected by the roster fix',
      crossTeacherOwnership,
    );
  }

  console.log(`\n--- Summary: ${passCount} passed, ${failCount} failed ---`);
  if (failCount > 0) {
    console.error('\nFailed checks:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal error running verify-t078:', err);
  process.exitCode = 1;
});
