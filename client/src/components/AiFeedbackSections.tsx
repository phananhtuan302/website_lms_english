/**
 * Renders `Answer.essayAiFeedback`/`speakingAiFeedback` (2026-09 essay, extended 2026-10
 * to Speaking too — see `server/src/grading/essayGradingPrompt.ts` and
 * `speakingGradingPrompt.ts`'s shared feedback-writing rules) as readable, sectioned
 * blocks instead of one unbroken run of text. The AI writes the string as labeled
 * paragraphs (e.g. "Nội dung & nhiệm vụ: ...", "Ngữ pháp: ...", "Điểm mạnh: ..." for
 * essay; "Lưu loát & mạch lạc: ...", "Phát âm: ...", "Điểm mạnh: ..." for speaking), each
 * paragraph itself a list of "- "-prefixed points — this component splits on every known
 * label (across both grading types — a given feedback string only ever uses one set) and
 * renders each as its own mini-section with a bold heading and a bullet list, so a
 * teacher/student can scan it instead of reading one dense paragraph.
 *
 * Falls back to plain `whitespace-pre-wrap` text when the string doesn't match this
 * shape at all (e.g. feedback from before this format existed, or essay's simple
 * non-IELTS path, which returns one free-form string rather than labeled fields).
 */

const SECTION_LABELS = [
  // Essay/Writing (IELTS Writing criteria).
  'Nội dung & nhiệm vụ',
  'Mạch lạc & liên kết',
  // Speaking (IELTS Speaking criteria) — "Từ vựng"/"Ngữ pháp" below are shared by both.
  'Lưu loát & mạch lạc',
  'Phát âm',
  'Từ vựng',
  'Ngữ pháp',
  // Shared closing note.
  'Điểm mạnh',
] as const;

/** `Điểm mạnh` (strengths) reads as a positive note — everything else is a deduction
 * category — so it gets a distinct (green vs. neutral) heading color to scan at a glance. */
const STRENGTHS_LABEL = 'Điểm mạnh';

interface FeedbackSection {
  label: string;
  lines: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SECTION_SPLIT_PATTERN = new RegExp(`(?:^|\\n)(${SECTION_LABELS.map(escapeRegExp).join('|')}):[ \\t]*`, 'g');

function parseSections(feedback: string): FeedbackSection[] | null {
  const matches = [...feedback.matchAll(SECTION_SPLIT_PATTERN)];
  if (matches.length === 0) return null;

  const sections: FeedbackSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : feedback.length;
    const label = match[1];
    const body = feedback.slice(start, end).trim();
    const lines = body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 0) sections.push({ label, lines });
  }
  return sections.length > 0 ? sections : null;
}

function SectionBody({ lines }: { lines: string[] }) {
  const allBullets = lines.every((line) => line.startsWith('- '));
  if (allBullets) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {lines.map((line, index) => (
          <li key={index}>{line.slice(2)}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-1">
      {lines.map((line, index) =>
        line.startsWith('- ') ? (
          <p key={index} className="pl-4">
            • {line.slice(2)}
          </p>
        ) : (
          <p key={index}>{line}</p>
        ),
      )}
    </div>
  );
}

interface AiFeedbackSectionsProps {
  feedback: string;
  className?: string;
}

function AiFeedbackSections({ feedback, className }: AiFeedbackSectionsProps) {
  const sections = parseSections(feedback);

  if (!sections) {
    return <p className={`whitespace-pre-wrap ${className ?? ''}`}>{feedback}</p>;
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      {sections.map((section) => (
        <div key={section.label}>
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              section.label === STRENGTHS_LABEL ? 'text-green-700' : 'text-primary-700'
            }`}
          >
            {section.label}
          </p>
          <div className="mt-1 text-sm text-base-black/80">
            <SectionBody lines={section.lines} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default AiFeedbackSections;
