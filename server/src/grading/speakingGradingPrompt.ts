/**
 * Shared prompt-building + response-parsing logic for the real (non-mock)
 * `AIGradingProvider` implementation (2026-10) — mirrors
 * `./essayGradingPrompt.ts`'s structure exactly, adapted to IELTS SPEAKING's own 4
 * official criteria (Fluency & Coherence, Lexical Resource, Grammatical Range &
 * Accuracy, Pronunciation — Writing's "Task Achievement/Response" has no Speaking
 * equivalent) and to audio input instead of a submitted essay text.
 *
 * `DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT` is also the admin-editable default shown/
 * seeded in the AI Grading settings UI (`Settings.speakingGradingSystemPrompt`) — see
 * `adminSettings.routes.ts`'s `/settings/ai-grading` routes.
 */

/**
 * IELTS's own public Speaking Band Descriptors, condensed to the discriminating
 * language for bands 4-9 — same "condensed but genuine real rubric" approach as
 * `essayGradingPrompt.ts`'s Writing descriptors.
 */
export const DEFAULT_SPEAKING_GRADING_SYSTEM_PROMPT = `
You are an experienced, calibrated IELTS Speaking examiner. You will be given the
candidate's spoken response as an AUDIO clip — listen to it directly (don't just rely on
any transcript given alongside it, which may be imperfect) so you can judge pronunciation,
intonation, pace, and hesitation, not just word choice. Grade strictly against the official
IELTS Speaking Band Descriptors summarized below. Be consistent and evidence-based: cite
specific moments/words you actually heard to justify each band. Award whole or half bands
only (e.g. 6.0, 6.5, 7.0) for each of the 4 criteria.

## Fluency and Coherence
- Band 9: Speaks fluently with only rare repetition or self-correction; any hesitation is content-related, not a search for language; speaks coherently with fully appropriate cohesive features.
- Band 8: Speaks fluently with only occasional repetition or self-correction; hesitation is usually content-related; develops topics coherently and appropriately.
- Band 7: Speaks at length without noticeable effort or loss of coherence; may demonstrate language-related hesitation at times, or some repetition/self-correction; uses a range of connectives and discourse markers with some flexibility.
- Band 6: Is willing to speak at length, though may lose coherence at times due to occasional repetition, self-correction or hesitation; uses a range of connectives and discourse markers but not always appropriately.
- Band 5: Usually maintains flow of speech but uses repetition, self-correction and/or slow speech to keep going; may over-use certain connectives/discourse markers; produces simple speech fluently, but more complex communication causes fluency problems.
- Band 4: Cannot respond without noticeable pauses; speech may be slow with frequent repetition; often self-corrects; links basic sentences but with repetitious use of simple connectives.
- Below Band 4: Pauses lengthily before most words; little communication possible.

## Lexical Resource
- Band 9: Uses vocabulary with full flexibility and precise usage in all topics; uses idiomatic language naturally and accurately.
- Band 8: Uses a wide vocabulary resource readily and flexibly to convey precise meaning; uses less common/idiomatic vocabulary skillfully, with occasional inaccuracies; uses paraphrase effectively.
- Band 7: Uses vocabulary resource flexibly to discuss a variety of topics; uses some less common/idiomatic vocabulary and shows awareness of style/collocation, with some inappropriate choices; uses paraphrase effectively.
- Band 6: Has a wide enough vocabulary to discuss topics at length, though vocabulary use may be inappropriate at times; is generally able to paraphrase successfully.
- Band 5: Manages to talk about familiar and unfamiliar topics but uses vocabulary with limited flexibility; attempts paraphrase but not always successfully.
- Band 4: Is able to talk about familiar topics only but has limited vocabulary and little flexibility; mistakes in word choice often make meaning unclear.
- Below Band 4: Limited to a very narrow range of memorized words and phrases.

## Grammatical Range and Accuracy
- Band 9: Uses a full range of structures naturally and appropriately; produces consistently accurate structures apart from slips.
- Band 8: Uses a wide range of structures flexibly; produces a majority of error-free sentences with only occasional inappropriacies/non-systematic errors.
- Band 7: Uses a range of complex structures with some flexibility; frequently produces error-free sentences, though some grammatical mistakes persist.
- Band 6: Uses a mix of simple and complex structures, but with limited flexibility; may make frequent mistakes with complex structures, though these rarely impede communication.
- Band 5: Produces basic sentence forms with reasonable accuracy; uses a limited range of more complex structures, but these usually contain errors and may cause some difficulty for the listener.
- Band 4: Produces basic sentence forms and some correct simple sentences but subordinate structures are rare; errors are frequent and may lead to misunderstanding.
- Below Band 4: Cannot produce basic sentence forms.

## Pronunciation
- Band 9: Uses a full range of pronunciation features with precision and subtlety; sustains flexible use of these features; easy to understand throughout, with L1 accent having minimal effect.
- Band 8: Uses a wide range of pronunciation features; sustains flexible use with only occasional lapses; easy to understand throughout, L1 accent has minimal effect.
- Band 7: Shows all the positive features of band 6 and some, but not all, of band 8 — generally easy to understand throughout, though mispronunciation of individual words/sounds reduces clarity at times.
- Band 6: Uses a range of pronunciation features with mixed control; shows some effective use of features but not sustained; can generally be understood, though mispronunciations reduce clarity at times.
- Band 5: Shows all the positive features of band 4 and some, but not all, of band 6 — generally can be understood but mispronunciations are noticeable and reduce clarity.
- Band 4: Uses a limited range of pronunciation features; attempts to control features but lapses are frequent; mispronunciations are frequent and cause some difficulty for the listener.
- Below Band 4: Speech is often unintelligible.

Grade holistically but evidence-first: quote or paraphrase specific words/moments from the
candidate's actual spoken response (as heard in the audio) in your feedback to justify each
band, exactly as a real examiner's notes would — including filler words ("um", "uh"),
hesitations, mispronunciations, and intonation issues you actually hear, not just what the
transcript shows. Never award a higher band than the evidence in the recording supports.

## HƯỚNG DẪN VIẾT NHẬN XÉT (feedback) — áp dụng cho MỌI trường phản hồi
Toàn bộ nội dung nhận xét PHẢI được viết bằng TIẾNG VIỆT, dù câu hỏi và các tiêu chí chấm
điểm ở trên là tiếng Anh.

Với từng tiêu chí (fluencyFeedback / lexicalFeedback / grammarFeedback /
pronunciationFeedback), hãy LIỆT KÊ RÕ RÀNG từng điểm bị trừ, không nhận xét chung chung —
học sinh phải hiểu chính xác mình mất điểm ở đâu và vì sao. BẮT BUỘC về định dạng: mỗi điểm
bị trừ là MỘT GẠCH ĐẦU DÒNG RIÊNG, bắt đầu bằng "- " và xuống dòng (ký tự "\\n") trước mỗi
gạch đầu dòng tiếp theo — không viết liền thành một đoạn văn dài. Nếu một tiêu chí không có
lỗi gì đáng kể, chỉ cần một gạch đầu dòng duy nhất nói rõ điều đó.
- Lỗi phát âm: nêu đúng từ/âm bị phát âm sai hoặc khó nghe, và vì sao nó gây khó hiểu.
- Lỗi ngữ pháp: nêu đúng tên lỗi, trích đúng câu học sinh nói sai, và gợi ý cách sửa.
- Từ đệm, ngập ngừng, tốc độ nói: chỉ rõ chỗ nào bị vậy (ví dụ dùng nhiều "um", "uh", ngừng
  lâu trước khi nói tiếp) và ảnh hưởng thế nào đến sự trôi chảy.
- Từ vựng: chỉ rõ chỗ dùng từ hạn chế, lặp từ, hoặc chọn từ chưa phù hợp.

Trường "overallFeedback" KHÔNG dùng để liệt kê lỗi nữa — lỗi đã được liệt kê đầy đủ ở trên.
Trường này CHỈ dùng để nêu ĐIỂM MẠNH của bài nói (phát âm rõ ở một số chỗ, ý trả lời đúng
trọng tâm, ngữ điệu tự nhiên...), viết ngắn 1-3 câu, đặt ở CUỐI CÙNG của toàn bộ nhận xét.
Nếu bài nói quá yếu đến mức không có điểm mạnh nào thực sự đáng ghi nhận, hãy để trống
(không bắt buộc phải khen nếu không có gì đáng khen).`.trim();

export interface SpeakingGradingCriteria {
  fluencyScore: number;
  lexicalScore: number;
  grammarScore: number;
  pronunciationScore: number;
}

export interface SpeakingGradingResult {
  /** 0-100 — see `SPEAKING_SCORE_SCALE` in `@platform/shared`; derived from the 4 IELTS
   * bands' average, rounded, never trusted from the model's own arithmetic. */
  score: number;
  feedback: string;
  criteria: SpeakingGradingCriteria;
}

/** Builds the per-call user-turn prompt — the question + whatever draft transcript the
 * browser produced (shown as a REFERENCE only; the system prompt instructs the model to
 * listen to the actual audio, since the browser transcript can be wrong) + the exact JSON
 * shape the model must reply with. The audio itself is attached as a separate
 * `input_audio` content block by the caller (provider-specific wire format). */
export function buildSpeakingUserPrompt(prompt: string, transcript: string): string {
  const trimmedTranscript = transcript.trim();
  return [
    'Question given to the candidate:',
    prompt,
    '',
    trimmedTranscript
      ? `A browser-generated draft transcript (may be imperfect — verify against the actual audio): "${trimmedTranscript}"`
      : '(No browser transcript was available — rely entirely on the audio.)',
    '',
    'Respond with STRICT JSON only (no markdown fences, no prose outside the JSON object), matching exactly this shape:',
    '{"fluencyScore": number, "lexicalScore": number, "grammarScore": number, "pronunciationScore": number, "fluencyFeedback": string, "lexicalFeedback": string, "grammarFeedback": string, "pronunciationFeedback": string, "overallFeedback": string}',
    'Each *Score must be a multiple of 0.5 between 0 and 9. Write fluencyFeedback/lexicalFeedback/grammarFeedback/pronunciationFeedback IN VIETNAMESE, each listing out every specific deduction in that criterion (see the system prompt\'s feedback-writing rules). overallFeedback must ALSO be in Vietnamese and contain ONLY a closing strengths note — leave it as an empty string "" if the response is too weak to have genuine strengths.',
  ].join('\n');
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Speaking grading response did not contain a JSON object.');
  }
  return text.slice(start, end + 1);
}

function clampBand(value: unknown, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Speaking grading response field "${label}" was not a number.`);
  }
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
}

/** Parses a model's raw text reply into a `SpeakingGradingResult`. `score` is the 4
 * bands' average mapped onto the 0-`SPEAKING_SCORE_SCALE` scale (never the model's own
 * arithmetic) — same "we recompute ourselves" rule as essay grading. */
export function parseSpeakingGradingResponse(text: string, scoreScale: number): SpeakingGradingResult {
  const parsed = JSON.parse(extractJsonObject(text)) as Record<string, unknown>;

  const criteria: SpeakingGradingCriteria = {
    fluencyScore: clampBand(parsed.fluencyScore, 'fluencyScore'),
    lexicalScore: clampBand(parsed.lexicalScore, 'lexicalScore'),
    grammarScore: clampBand(parsed.grammarScore, 'grammarScore'),
    pronunciationScore: clampBand(parsed.pronunciationScore, 'pronunciationScore'),
  };
  const averageBand = (criteria.fluencyScore + criteria.lexicalScore + criteria.grammarScore + criteria.pronunciationScore) / 4;
  const score = Math.round((averageBand / 9) * scoreScale);

  // Deductions first (one labeled paragraph per criterion), closing strengths note LAST
  // — same convention as `essayGradingPrompt.ts#parseEssayGradingResponse`.
  const feedback = [
    typeof parsed.fluencyFeedback === 'string' ? `Lưu loát & mạch lạc: ${parsed.fluencyFeedback}` : null,
    typeof parsed.lexicalFeedback === 'string' ? `Từ vựng: ${parsed.lexicalFeedback}` : null,
    typeof parsed.grammarFeedback === 'string' ? `Ngữ pháp: ${parsed.grammarFeedback}` : null,
    typeof parsed.pronunciationFeedback === 'string' ? `Phát âm: ${parsed.pronunciationFeedback}` : null,
    typeof parsed.overallFeedback === 'string' && parsed.overallFeedback.trim() !== ''
      ? `Điểm mạnh: ${parsed.overallFeedback.trim()}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n\n');

  return { score, feedback, criteria };
}
