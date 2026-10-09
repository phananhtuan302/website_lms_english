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
import { extractJsonObject } from '../lib/extractJsonObject';

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
length only matters through the Task Achievement/Response lens above.

## HƯỚNG DẪN VIẾT NHẬN XÉT (feedback) — áp dụng cho MỌI trường phản hồi
Toàn bộ nội dung nhận xét PHẢI được viết bằng TIẾNG VIỆT, dù bài làm của học sinh và các
tiêu chí chấm điểm ở trên là tiếng Anh.

Với từng tiêu chí (taskFeedback / coherenceFeedback / lexicalFeedback / grammarFeedback,
hoặc đoạn đầu của "feedback" khi không chấm theo 4 tiêu chí riêng), hãy LIỆT KÊ RÕ RÀNG
từng điểm bị trừ, không nhận xét chung chung — học sinh phải hiểu chính xác mình mất điểm
ở đâu và vì sao. BẮT BUỘC về định dạng: mỗi điểm bị trừ là MỘT GẠCH ĐẦU DÒNG RIÊNG, bắt đầu
bằng "- " và xuống dòng (ký tự "\n") trước mỗi gạch đầu dòng tiếp theo — không viết liền
thành một đoạn văn dài. Nếu một tiêu chí không có lỗi gì đáng kể, chỉ cần một gạch đầu dòng
duy nhất nói rõ điều đó.
- Lỗi ngữ pháp: nêu đúng tên lỗi (chia động từ sai, sai thì, thiếu/sai mạo từ, sai giới từ,
  sai số ít/số nhiều, trật tự từ sai...), trích đúng cụm/câu học sinh viết sai, và gợi ý
  cách sửa.
- Câu văn diễn đạt chưa tốt, gượng gạo, dùng từ chưa tự nhiên: trích câu đó ra và giải
  thích vì sao nó chưa ổn.
- Nội dung rối, thiếu mạch lạc, ý lặp lại, triển khai sơ sài, hoặc lạc một phần yêu cầu đề:
  chỉ rõ đoạn/ý nào bị vậy và vì sao.

Trường "overallFeedback" (hoặc câu cuối của "feedback" khi không chấm theo 4 tiêu chí
riêng) KHÔNG dùng để liệt kê lỗi nữa — lỗi đã được liệt kê đầy đủ ở trên. Trường này CHỈ
dùng để nêu ĐIỂM MẠNH của bài làm (ý tưởng hay, từ vựng tốt ở một số chỗ, câu phức dùng
đúng, mở bài ấn tượng...), viết ngắn 1-3 câu, đặt ở CUỐI CÙNG của toàn bộ nhận xét. Nếu bài
làm quá yếu đến mức không có điểm mạnh nào thực sự đáng ghi nhận, hãy để trống (không bắt
buộc phải khen nếu không có gì đáng khen).`.trim();

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
      'Each *Score must be a multiple of 0.5 between 0 and 9. Write taskFeedback/coherenceFeedback/lexicalFeedback/grammarFeedback IN VIETNAMESE, each listing out every specific deduction in that criterion (see the system prompt\'s feedback-writing rules). overallFeedback must ALSO be in Vietnamese and contain ONLY a closing strengths note — leave it as an empty string "" if the response is too weak to have genuine strengths.',
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
    `score must be a whole or half number between 0 and ${input.essayMaxScore}. feedback must be written IN VIETNAMESE: first list out every specific deduction (grammar mistakes named precisely, awkward/unnatural sentences quoted, confusing or underdeveloped content pointed out — see the system prompt's feedback-writing rules), THEN end with a short strengths note — or no strengths note at all if the response is too weak to have genuine strengths.`,
  ]
    .filter(Boolean)
    .join('\n');
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
    // Deductions first (one labeled paragraph per criterion, each listing its own specific
    // errors), the closing strengths note LAST — `overallFeedback` is repurposed to be
    // exactly that closing note (see the system prompt's feedback-writing rules), and is
    // omitted entirely when blank rather than showing an empty "Điểm mạnh:" line.
    const feedback = [
      typeof parsed.taskFeedback === 'string' ? `Nội dung & nhiệm vụ: ${parsed.taskFeedback}` : null,
      typeof parsed.coherenceFeedback === 'string' ? `Mạch lạc & liên kết: ${parsed.coherenceFeedback}` : null,
      typeof parsed.lexicalFeedback === 'string' ? `Từ vựng: ${parsed.lexicalFeedback}` : null,
      typeof parsed.grammarFeedback === 'string' ? `Ngữ pháp: ${parsed.grammarFeedback}` : null,
      typeof parsed.overallFeedback === 'string' && parsed.overallFeedback.trim() !== ''
        ? `Điểm mạnh: ${parsed.overallFeedback.trim()}`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join('\n\n');
    return { score, feedback, criteria };
  }

  if (typeof parsed.score !== 'number' || Number.isNaN(parsed.score)) {
    throw new Error('Essay grading response field "score" was not a number.');
  }
  const score = Math.min(input.essayMaxScore, Math.max(0, Math.round(parsed.score * 2) / 2));
  const feedback = typeof parsed.feedback === 'string' ? parsed.feedback : '(No feedback text returned.)';
  return { score, feedback, criteria: null };
}
