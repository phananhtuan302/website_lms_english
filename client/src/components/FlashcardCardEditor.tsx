import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FlashcardCardDTO, FlashcardCardInput } from '@platform/shared';
import { lookupWord, suggestWords, type DictionaryEntry } from '../lib/dictionary';

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
  const { t } = useTranslation();
  const [term, setTerm] = useState(card.term);
  const [meaning, setMeaning] = useState(card.meaning);
  const [ipa, setIpa] = useState(card.ipa ?? '');
  const [imageUrl, setImageUrl] = useState(card.imageUrl ?? '');
  const [audioUrl, setAudioUrl] = useState(card.audioUrl ?? '');
  const [exampleSentence, setExampleSentence] = useState(card.exampleSentence ?? '');
  const [synonymsText, setSynonymsText] = useState(card.synonyms.join(', '));
  const [antonymsText, setAntonymsText] = useState(card.antonyms.join(', '));
  const [saveError, setSaveError] = useState<string | null>(null);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<DictionaryEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const isSelectingSuggestionRef = useRef(false);

  // Auto query suggestions on term input
  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(() => {
      suggestWords(trimmed, 6).then((results) => {
        if (isMounted) {
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        }
      });
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [term]);

  // Handle click outside suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (termContainerRef.current && !termContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function splitList(text: string): string[] {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function currentBody(overrideTerm?: string, overrideIpa?: string, overrideMeaning?: string): FlashcardCardInput {
    const tVal = overrideTerm !== undefined ? overrideTerm : term;
    const iVal = overrideIpa !== undefined ? overrideIpa : ipa;
    const mVal = overrideMeaning !== undefined ? overrideMeaning : meaning;
    return {
      term: tVal,
      meaning: mVal,
      ipa: iVal.trim() || null,
      imageUrl: imageUrl.trim() || null,
      audioUrl: audioUrl.trim() || null,
      exampleSentence: exampleSentence.trim() || null,
      synonyms: splitList(synonymsText),
      antonyms: splitList(antonymsText),
    };
  }

  async function save(overrideTerm?: string, overrideIpa?: string, overrideMeaning?: string) {
    try {
      setSaveError(null);
      await onSave(currentBody(overrideTerm, overrideIpa, overrideMeaning));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('flashcardCardEditor.saveError'));
    }
  }

  // Auto-fill on blur if term matches an offline dictionary entry
  async function handleTermBlur() {
    if (isSelectingSuggestionRef.current) return;
    setShowSuggestions(false);

    const trimmed = term.trim();
    if (trimmed) {
      const match = await lookupWord(trimmed);
      if (match) {
        let newIpa = ipa;
        let newMeaning = meaning;
        if (!ipa || ipa === '/ˈæp.əl/' || ipa === '') {
          newIpa = match.ipa;
          setIpa(match.ipa);
        }
        if (!meaning || meaning === 'meaning' || meaning === 'a plan for a journey') {
          newMeaning = match.meaning;
          setMeaning(match.meaning);
        }
        await save(term, newIpa, newMeaning);
        return;
      }
    }
    await save();
  }

  // Handle selecting a suggested word
  async function handleSelectSuggestion(entry: DictionaryEntry) {
    isSelectingSuggestionRef.current = true;
    setTerm(entry.word);
    setIpa(entry.ipa);
    setMeaning(entry.meaning);
    setShowSuggestions(false);

    await save(entry.word, entry.ipa, entry.meaning);

    setTimeout(() => {
      isSelectingSuggestionRef.current = false;
    }, 200);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 transition-all hover:border-slate-300">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 pb-2.5">
        <span className="rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700">
          {t('flashcardCardEditor.cardLabel', { number: index + 1 })}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
        >
          {t('flashcardCardEditor.delete')}
        </button>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Term field with suggestions */}
        <div ref={termContainerRef} className="relative flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <label htmlFor={`term-input-${card.id}`} className="flex items-center gap-1">
            <span>{t('flashcardCardEditor.termLabel')}</span>
            <span className="text-rose-500 font-bold" title="Bắt buộc">*</span>
          </label>
          <input
            id={`term-input-${card.id}`}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => void handleTermBlur()}
            placeholder="Nhập từ vựng tiếng Anh..."
            autoComplete="off"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Gợi ý từ điển offline
              </div>
              {suggestions.map((item) => (
                <button
                  key={item.word}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void handleSelectSuggestion(item);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{item.word}</span>
                    {item.ipa && <span className="font-mono text-[11px] text-slate-400">{item.ipa}</span>}
                  </div>
                  <span className="max-w-[180px] truncate text-[11px] text-slate-500">{item.meaning}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Meaning field */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <div className="flex items-center gap-1">
            <span>{t('flashcardCardEditor.meaningLabel')}</span>
            <span className="text-rose-500 font-bold" title="Bắt buộc">*</span>
          </div>
          <input
            type="text"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            onBlur={() => void save()}
            placeholder="Nhập nghĩa của từ..."
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </label>

        {/* IPA field */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <span>{t('flashcardCardEditor.ipaLabel')}</span>
          <input
            type="text"
            value={ipa}
            onChange={(e) => setIpa(e.target.value)}
            onBlur={() => void save()}
            placeholder={t('flashcardCardEditor.ipaPlaceholder')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </label>

        {/* Image URL field */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <span>{t('flashcardCardEditor.imageUrlLabel')}</span>
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onBlur={() => void save()}
            placeholder="https://..."
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </label>

        {/* Audio URL field */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <span>{t('flashcardCardEditor.audioUrlLabel')}</span>
          <input
            type="text"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            onBlur={() => void save()}
            placeholder="https://..."
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </label>

        {/* Example Sentence field */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <span>{t('flashcardCardEditor.exampleSentenceLabel')}</span>
          <input
            type="text"
            value={exampleSentence}
            onChange={(e) => setExampleSentence(e.target.value)}
            onBlur={() => void save()}
            placeholder={t('flashcardCardEditor.exampleSentencePlaceholder')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </label>

        {/* Synonyms field */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <span>{t('flashcardCardEditor.synonymsLabel')}</span>
          <input
            type="text"
            value={synonymsText}
            onChange={(e) => setSynonymsText(e.target.value)}
            onBlur={() => void save()}
            placeholder="cách nhau bằng dấu phẩy..."
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </label>

        {/* Antonyms field */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
          <span>{t('flashcardCardEditor.antonymsLabel')}</span>
          <input
            type="text"
            value={antonymsText}
            onChange={(e) => setAntonymsText(e.target.value)}
            onBlur={() => void save()}
            placeholder="cách nhau bằng dấu phẩy..."
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </label>
      </div>

      {saveError && <p className="mt-2 text-xs font-medium text-rose-600">{saveError}</p>}
    </div>
  );
}

export default FlashcardCardEditor;
