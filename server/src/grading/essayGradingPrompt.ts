/**
 * Shared prompt-building + response-parsing logic for every REAL (non-mock)
 * `EssayGradingProvider` implementation — originally written inline inside
 * `anthropicEssayGradingProvider.ts`, pulled out here so `OpenAiCompatibleEssayGradingProvider`
 * (2026-10, admin-configurable endpoint) can reuse the exact same user-prompt shape and
 * strict-JSON parsing instead of duplicating it.
 *
 * `DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT` is also the admin-editable default shown/seeded
 * in the AI Grading settings UI (`Settings.essayGradingSystemPrompt`) — see
 * `adminSettings.routes.ts`'s `/settings/ai-grading` routes.
 */

import type { EssayGradingCriteria, EssayGradingInput, EssayGradingResult } from './essayGradingProvider';

/**
 * The full grading rubric handed to the model as its system prompt — IELTS's own public
 * Writing Band Descriptors, condensed to the discriminating language for bands 4-9 (the
 * practically relevant range for almost every real submission; a response weaker than
 * band 4 is instructed to be scored 0-3.5 by extrapolation, not given its own exhaustive
 * table).
 */
export const DEFAULT_ESSAY_GRADING_SYSTEM_PROMPT = `
You are an experienced, calibrated IELTS Writing examiner. Grade the candidate's response
strictly against the official IELTS Writing Band Descriptors summarized below. Be
consistent and evidence-based: cite specific features of the response (not generic
praise/criticism) to justify each band. Award whole or half bands only (e.g. 6.0, 6.5,
7.0) for each of the 4 criteria.

## Task Achievement (Task 1 — describing/summarizing visual data, a process, or a letter)
- Band 9: Fully satisfies all requirements of the task; clearly presents a fully developed response.
- Band 8: Covers requirements sufficiently; presents, highlights and illustrates key features/bullet points clearly and appropriately.
- Band 7: Covers the requirements; clearly presents and highlights key features/bullet points, but details could be more fully or appropriately extended.
- Band 6: Addresses the requirements; an overview with appropriately selected information; key features/bullet points are adequately covered.
- Band 5: Generally addresses the task; the format may be inappropriate in places; a clear overview is attempted but not fully achieved; mechanical or repetitive presentation of data; may include irrelevant, inaccurate, or repetitive detail.
- Band 4: Attempts to address the task but does not cover all requirements; format may be inappropriate; no clear overview; limited, irrelevant, or inaccurate detail.
- Below Band 4: Barely responds to the task; little or no relevant content.

## Task Response (Task 2 — an argumentative/discussion essay)
- Band 9: Fully addresses all parts of the task with a fully developed position and relevant, fully extended and well-supported ideas.
- Band 8: Sufficiently addresses all parts of the task with a well-developed response and relevant, extended, and supported ideas.
- Band 7: Addresses all parts of the task; presents a clear position throughout; ideas are extended and supported, though there may be a tendency to over-generalize.
- Band 6: Addresses all parts of the task, although some parts may be more fully covered than others; presents a relevant position, though conclusions may be unclear/repetitive; main ideas are relevant but some may be underdeveloped or unclear.
- Band 5: Addresses the task only partially; the format may be inappropriate; the position may be unclear; presents limited main ideas, mostly relevant but underdeveloped/unclear.
- Band 4: Responds minimally or tangentially to the task; position unclear; very few ideas, largely undeveloped or irrelevant.
- Below Band 4: Barely addresses the task at all.

## Coherence and Cohesion (same descriptors for Task 1 and Task 2)
- Band 9: Uses cohesion so skillfully it attracts no attention; skillful paragraphing.
- Band 8: Sequences information and ideas logically; cohesion is well managed; paragraphing is sufficient and appropriate.
- Band 7: Logically organizes information and ideas with clear progression throughout; uses a range of cohesive devices appropriately although there may be some under-/over-use; a clear central topic within each paragraph.
- Band 6: Arranges information and ideas coherently with clear overall progression; uses cohesive devices effectively but cohesion within/between sentences may be faulty or mechanical; may not always use referencing clearly/appropriately; paragraphing may not always be logical.
- Band 5: Organizes information/ideas but lacks overall progression; may be a lack of logical sequencing; inadequate, inaccurate, or overused cohesive devices; information/ideas may be repetitive due to inadequate referencing/substitution; paragraphing may be inadequate or missing.
- Band 4: Presents information/ideas but these are not logically arranged; little or no sense of progression; uses a very limited range of cohesive devices, and those used may not indicate a logical relationship; little or no evidence of paragraphing.
- Below Band 4: Fails to communicate any message; no organization evident.

## Lexical Resource (same descriptors for Task 1 and Task 2)
- Band 9: Wide range of vocabulary with very natural and sophisticated control; rare minor errors occur only as slips.
- Band 8: Wide resource fluently and flexibly to convey precise meanings; skillfully uses uncommon and/or idiomatic vocabulary despite occasional inaccuracies; effective word choice and collocation; occasional errors in spelling and/or word formation.
- Band 7: Sufficient range to allow some flexibility and precision; uses less common vocabulary with some awareness of style/collocation; may produce occasional errors in word choice/spelling/word formation, but these do not impede communication.
- Band 6: Adequate range for the task; attempts to use less common vocabulary but with some inaccuracy; makes noticeable errors in spelling and/or word formation, but this does not impede communication.
- Band 5: Limited range, minimally adequate for the task; may make noticeably inappropriate word choices; limited control of word formation and/or spelling; errors may cause some difficulty for the reader.
- Band 4: Uses only basic vocabulary, used repetitively or possibly inappropriately; has limited control of word formation and/or spelling; errors may cause strain for the reader.
- Below Band 4: Extremely limited vocabulary; essentially no control of word formation/spelling.

## Grammatical Range and Accuracy (same descriptors for Task 1 and Task 2)
- Band 9: Wide range of structures with full flexibility and accuracy; rare minor errors occur only as slips.
- Band 8: Wide range of structures; the majority of sentences are error-free; good control of grammar/punctuation with just occasional errors or inappropriacies.
- Band 7: A variety of complex structures; produces frequent error-free sentences; has good control of grammar/punctuation but may make a few errors.
- Band 6: Uses a mix of simple and complex sentence forms; makes some errors in grammar/punctuation, but they rarely reduce communication.
- Band 5: Uses only a limited range of structures; attempts complex sentences but these tend to be less accurate than simple ones; may make frequent grammatical/punctuation errors that can cause some difficulty for the reader.
- Band 4: Uses only a very limited range of structures with only rare use of subordinate clauses; some structures are accurate, but errors predominate, and punctuation is often faulty — this can make comprehension difficult.
- Below Band 4: Cannot use sentence forms except in memorized phrases.

Grade holistically but evidence-first: quote or paraphrase specific phrases from the
candidate's response in your feedback to justify each band, exactly as a real examiner's
notes would. Never award a higher band than the evidence in the response supports, and
never let response length alone drive the Task score once the minimum length is met —
length only matters through the Task Achievement/Response lens above.`.trim();

/** Builds the per-call user-turn prompt (question + candidate's answer + the exact JSON
 * shape the model must reply with) from one `EssayGradingInput`. */
export function buildEssayUserPrompt(input: EssayGradingInput): string {
  const taskLabel = input.essayTaskType === 'task1' ? 'IELTS Writing Task 1' : input.essayTaskType === 'task2' ? 'IELTS Writing Task 2' : 'a Writing task';
  const minWordsLine = input.essayMinWords != null ? `Minimum expected length: ${input.essayMinWords} words.` : '';
  const wordCount = input.essayText.trim().split(/\s+/).filter(Boolean).length;

  if (input.useIeltsCriteria) {
    return [
      `Task type: ${taskLabel}.`,
      minWordsLine,
      '',
      'Question prompt given to the candidate:',
      input.prompt,
      '',
      `Candidate's response (${wordCount} words):`,
      input.essayText,
      '',
      'Respond with STRICT JSON only (no markdown fences, no prose outside the JSON object), matching exactly this shape:',
      '{"taskScore": number, "coherenceScore": number, "lexicalScore": number, "grammarScore": number, "taskFeedback": string, "coherenceFeedback": string, "lexicalFeedback": string, "grammarFeedback": string, "overallFeedback": string}',
      'Each *Score must be a multiple of 0.5 between 0 and 9. Each *Feedback string should be 1-3 sentences of specific, evidence-based justification for that criterion\'s band. overallFeedback should be a short (2-4 sentence) summary a student can act on.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `Task type: ${taskLabel} (graded out of ${input.essayMaxScore} points, not the IELTS 0-9 band scale).`,
    minWordsLine,
    '',
    'Question prompt given to the candidate:',
    input.prompt,
    '',
    `Candidate's response (${wordCount} words):`,
    input.essayText,
    '',
    `Using the same 4 IELTS criteria as a holistic guide, give one overall score out of ${input.essayMaxScore} reflecting overall writing quality.`,
    'Respond with STRICT JSON only (no markdown fences, no prose outside the JSON object), matching exactly this shape:',
    `{"score": number, "feedback": string}`,
    `score must be a whole or half number between 0 and ${input.essayMaxScore}. feedback should be 2-4 sentences of specific, evidence-based justification.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Extracts the first top-level `{...}` object from a string — tolerates a model
 * wrapping its JSON in ```json fences or a stray sentence despite being asked not to,
 * without needing a full JSON-repair library for what should almost always already be
 * clean output. */
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Essay grading response did not contain a JSON object.');
  }
  return text.slice(start, end + 1);
}

function clampBand(value: unknown, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Essay grading response field "${label}" was not a number.`);
  }
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
}

/** Parses a model's raw text reply (expected to be, or contain, the strict JSON shape
 * `buildEssayUserPrompt` asked for) into an `EssayGradingResult`, applying the same
 * "we recompute the overall score ourselves, never trust the model's own arithmetic"
 * rule the teacher-grading endpoint already applies to a human-entered breakdown. */
export function parseEssayGradingResponse(text: string, input: EssayGradingInput): EssayGradingResult {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;

  if (input.useIeltsCriteria) {
    const criteria: EssayGradingCriteria = {
      taskScore: clampBand(parsed.taskScore, 'taskScore'),
      coherenceScore: clampBand(parsed.coherenceScore, 'coherenceScore'),
      lexicalScore: clampBand(parsed.lexicalScore, 'lexicalScore'),
      grammarScore: clampBand(parsed.grammarScore, 'grammarScore'),
    };
    const average = (criteria.taskScore + criteria.coherenceScore + criteria.lexicalScore + criteria.grammarScore) / 4;
    const score = Math.round(average * 2) / 2;
    const feedback = [
      typeof parsed.overallFeedback === 'string' ? parsed.overallFeedback : null,
      typeof parsed.taskFeedback === 'string' ? `Task: ${parsed.taskFeedback}` : null,
      typeof parsed.coherenceFeedback === 'string' ? `Coherence & Cohesion: ${parsed.coherenceFeedback}` : null,
      typeof parsed.lexicalFeedback === 'string' ? `Lexical Resource: ${parsed.lexicalFeedback}` : null,
      typeof parsed.grammarFeedback === 'string' ? `Grammatical Range & Accuracy: ${parsed.grammarFeedback}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
    return { score, feedback, criteria };
  }

  if (typeof parsed.score !== 'number' || Number.isNaN(parsed.score)) {
    throw new Error('Essay grading response field "score" was not a number.');
  }
  const score = Math.min(input.essayMaxScore, Math.max(0, Math.round(parsed.score * 2) / 2));
  const feedback = typeof parsed.feedback === 'string' ? parsed.feedback : '(No feedback text returned.)';
  return { score, feedback, criteria: null };
}
