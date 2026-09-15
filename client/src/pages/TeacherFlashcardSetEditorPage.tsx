import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  FlashcardCardInput,
  FlashcardSetDetailDTO,
  SentenceSubmissionDTO,
  UnitDTO,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import FlashcardCardEditor from '../components/FlashcardCardEditor';

/** Default new-card shape — a sensible, editable placeholder, same convention as
 * `TeacherTestEditorPage.tsx`'s `defaultQuestionBody`. */
function defaultCardBody(): FlashcardCardInput {
  return { term: 'new-word', meaning: 'meaning' };
}

/**
 * Flashcard set editor (T-022): edit the set's name/unit tag, add/edit/delete
 * vocabulary cards. Same structure as `TeacherTestEditorPage.tsx`.
 */
function TeacherFlashcardSetEditorPage() {
  const { t } = useTranslation();
  const { setId } = useParams<{ setId: string }>();
  const [set, setSet] = useState<FlashcardSetDetailDTO | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitDTO[]>([]);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [submissions, setSubmissions] = useState<SentenceSubmissionDTO[] | null>(null);

  const refresh = useCallback(() => {
    if (!setId) return;
    teacherApi
      .getFlashcardSet(setId)
      .then((data) => {
        setSet(data);
        setName(data.name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t('teacherFlashcardSetEditor.loadError')));
  }, [setId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    teacherApi
      .listUnits()
      .then(setUnits)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!setId) return;
    teacherApi
      .listSentenceSubmissions(setId)
      .then(setSubmissions)
      .catch(() => undefined);
  }, [setId]);

  if (!setId) return null;

  async function handleSaveName() {
    if (!set || name.trim() === '' || name === set.name) return;
    try {
      const updated = await teacherApi.updateFlashcardSet(setId!, { name: name.trim() });
      setSet(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherFlashcardSetEditor.saveNameError'));
    }
  }

  async function handleSaveUnit(unitId: string | null) {
    if (!set) return;
    try {
      const updated = await teacherApi.updateFlashcardSet(setId!, { name: set.name, unitId });
      setSet(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherFlashcardSetEditor.saveUnitError'));
    }
  }

  async function handleAddCard(event: FormEvent) {
    event.preventDefault();
    setIsAddingCard(true);
    setError(null);
    try {
      const updated = await teacherApi.addFlashcardCard(setId!, defaultCardBody());
      setSet(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherFlashcardSetEditor.addCardError'));
    } finally {
      setIsAddingCard(false);
    }
  }

  async function handleSaveCard(cardId: string, body: FlashcardCardInput) {
    const updated = await teacherApi.updateFlashcardCard(setId!, cardId, body);
    setSet(updated);
  }

  async function handleDeleteCard(cardId: string) {
    try {
      const updated = await teacherApi.deleteFlashcardCard(setId!, cardId);
      setSet(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('teacherFlashcardSetEditor.deleteCardError'));
    }
  }

  if (!set) {
    return (
      <div>
        <Link to="/teacher/flashcard-sets" className="text-sm text-primary-600 hover:underline">
          {t('teacherFlashcardSetEditor.backToSets')}
        </Link>
        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-base-black/60">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center justify-between">
          <Link to="/teacher/flashcard-sets" className="text-sm text-primary-600 hover:underline">
            {t('teacherFlashcardSetEditor.backToSets')}
          </Link>
          <Link to={`/teacher/flashcard-sets/${setId}/progress`} className="text-sm font-medium text-primary-600 hover:underline">
            {t('teacherFlashcardSetEditor.viewProgress')}
          </Link>
        </div>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={handleSaveName}
          className="mt-2 w-full rounded-md border border-primary-200 px-3 py-2 text-2xl font-bold text-primary-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            {t('teacherFlashcardSetEditor.unitLabel')}
            <select
              value={set.unitId ?? ''}
              onChange={(event) => handleSaveUnit(event.target.value === '' ? null : event.target.value)}
              className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">{t('teacherFlashcardSetEditor.noUnitOption')}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-base-black">{t('teacherFlashcardSetEditor.cardsHeading')}</h2>
        {set.cards.length === 0 && (
          <p className="text-sm text-base-black/60">{t('teacherFlashcardSetEditor.noCardsEmpty')}</p>
        )}
        <div className="flex flex-col gap-3">
          {set.cards.map((card, index) => (
            <FlashcardCardEditor
              key={card.id}
              card={card}
              index={index}
              onSave={(body) => handleSaveCard(card.id, body)}
              onDelete={() => handleDeleteCard(card.id)}
            />
          ))}
        </div>

        <form onSubmit={handleAddCard}>
          <button
            type="submit"
            disabled={isAddingCard}
            className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAddingCard ? t('teacherFlashcardSetEditor.addingCard') : t('teacherFlashcardSetEditor.addCardButton')}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">
          {t('teacherFlashcardSetEditor.submissionsHeading')}
        </h2>
        <p className="text-sm text-base-black/60">{t('teacherFlashcardSetEditor.submissionsSubtitle')}</p>
        {submissions === null ? (
          <p className="text-sm text-base-black/60">{t('common.loading')}</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-base-black/60">{t('teacherFlashcardSetEditor.noSubmissions')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-md border border-primary-200 p-3 text-sm">
                <div className="flex items-center justify-between text-xs text-base-black/50">
                  <span>
                    {t('teacherFlashcardSetEditor.submissionWordPrefix', { name: s.studentName })}{' '}
                    <span className="font-semibold">{s.term}</span>
                  </span>
                  <span
                    className={
                      s.containsWord ? 'font-semibold text-green-700' : 'font-semibold text-base-black/50'
                    }
                  >
                    {s.containsWord
                      ? t('teacherFlashcardSetEditor.usedWord')
                      : t('teacherFlashcardSetEditor.wordNotDetected')}
                  </span>
                </div>
                <p className="mt-1 text-base-black">{s.sentence}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default TeacherFlashcardSetEditorPage;
