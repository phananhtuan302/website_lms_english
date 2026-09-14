import { useState } from 'react';
import type { FlashcardCardDTO, FlashcardCardInput } from '@platform/shared';

interface FlashcardCardEditorProps {
  card: FlashcardCardDTO;
  index: number;
  onSave: (body: FlashcardCardInput) => Promise<void>;
  onDelete: () => void;
}

/**
 * Editor for a single vocabulary card (T-022) — term/meaning/IPA/image/audio/example
 * sentence/synonyms/antonyms. Same "local draft, save on blur" convention as
 * `QuestionEditor.tsx`: typing doesn't fire a request per keystroke, a save only
 * happens when a field loses focus.
 */
function FlashcardCardEditor({ card, index, onSave, onDelete }: FlashcardCardEditorProps) {
  const [term, setTerm] = useState(card.term);
  const [meaning, setMeaning] = useState(card.meaning);
  const [ipa, setIpa] = useState(card.ipa ?? '');
  const [imageUrl, setImageUrl] = useState(card.imageUrl ?? '');
  const [audioUrl, setAudioUrl] = useState(card.audioUrl ?? '');
  const [exampleSentence, setExampleSentence] = useState(card.exampleSentence ?? '');
  const [synonymsText, setSynonymsText] = useState(card.synonyms.join(', '));
  const [antonymsText, setAntonymsText] = useState(card.antonyms.join(', '));
  const [saveError, setSaveError] = useState<string | null>(null);

  function splitList(text: string): string[] {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function currentBody(): FlashcardCardInput {
    return {
      term,
      meaning,
      ipa: ipa.trim() || null,
      imageUrl: imageUrl.trim() || null,
      audioUrl: audioUrl.trim() || null,
      exampleSentence: exampleSentence.trim() || null,
      synonyms: splitList(synonymsText),
      antonyms: splitList(antonymsText),
    };
  }

  async function save() {
    try {
      setSaveError(null);
      await onSave(currentBody());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save card.');
    }
  }

  return (
    <div className="rounded-lg border border-primary-100 bg-base-white p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
          Card {index + 1}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Term
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onBlur={() => void save()}
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Meaning
          <input
            type="text"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            onBlur={() => void save()}
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          IPA (optional)
          <input
            type="text"
            value={ipa}
            onChange={(e) => setIpa(e.target.value)}
            onBlur={() => void save()}
            placeholder="/ˈæp.əl/"
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Image URL (optional)
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onBlur={() => void save()}
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Audio URL (optional — enables the listen-and-type exercise)
          <input
            type="text"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            onBlur={() => void save()}
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Example sentence (optional — use ___ for the blank)
          <input
            type="text"
            value={exampleSentence}
            onChange={(e) => setExampleSentence(e.target.value)}
            onBlur={() => void save()}
            placeholder="She ate an ___ for breakfast."
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Synonyms (comma-separated, optional)
          <input
            type="text"
            value={synonymsText}
            onChange={(e) => setSynonymsText(e.target.value)}
            onBlur={() => void save()}
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-base-black">
          Antonyms (comma-separated, optional)
          <input
            type="text"
            value={antonymsText}
            onChange={(e) => setAntonymsText(e.target.value)}
            onBlur={() => void save()}
            className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </label>
      </div>

      {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
    </div>
  );
}

export default FlashcardCardEditor;
