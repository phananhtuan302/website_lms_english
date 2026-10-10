import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  FlashcardCardInput,
  FlashcardSetDetailDTO,
  SentenceSubmissionDTO,
  UnitDTO,
} from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import { useAuth } from '../context/useAuth';
import FlashcardCardEditor from '../components/FlashcardCardEditor';
import FlashcardExcelImportPanel from '../components/FlashcardExcelImportPanel';
import AiVocabGeneratorPanel from '../components/AiVocabGeneratorPanel';
import LibraryBreadcrumb from '../components/LibraryBreadcrumb';

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
  const { user } = useAuth();
  const { setId } = useParams<{ setId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
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
    // `t` is stable in practice (site-wide, admin-controlled language — PROJECT_PLAN
    // Guiding Principle 3/Assumption A13), safe to omit from this dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const defaultBackLink = user?.role === 'admin' ? '/admin/flashcard-sets' : '/teacher/flashcard-sets';
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  const handleBack = () => {
    if (returnTo) {
      navigate(returnTo);
    } else if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(defaultBackLink);
    }
  };

  const backButtonElement = (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      {returnTo ? 'Quay lại' : 'Danh sách bộ thẻ'}
    </button>
  );

  if (!set) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {backButtonElement}
          <span className="text-slate-300">|</span>
          <LibraryBreadcrumb section="flashcards" linkSection />
        </div>
        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t('common.loading')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            {backButtonElement}
            <span className="text-slate-300">|</span>
            <LibraryBreadcrumb section="flashcards" linkSection />
          </div>

          <Link
            to={`/teacher/flashcard-sets/${setId}/progress`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50/50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-100"
          >
            <span>{t('teacherFlashcardSetEditor.viewProgress')}</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
            Tên bộ thẻ từ vựng
          </label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={handleSaveName}
            placeholder="Nhập tên bộ thẻ từ vựng..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-lg font-bold text-slate-900 shadow-2xs transition-colors focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />

          <div className="mt-4 max-w-sm">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-600">
                {t('teacherFlashcardSetEditor.unitLabel')}
              </span>
              <select
                value={set.unitId ?? ''}
                onChange={(event) => handleSaveUnit(event.target.value === '' ? null : event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-800 shadow-2xs focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">{t('teacherFlashcardSetEditor.noUnitOption')}</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
        </div>
      </div>

      {/* Import Excel Panel */}
      <FlashcardExcelImportPanel setId={setId} onImported={setSet} />
      <AiVocabGeneratorPanel setId={setId} onImported={setSet} />

      {/* Cards List Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">{t('teacherFlashcardSetEditor.cardsHeading')}</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {set.cards.length} thẻ
            </span>
          </div>
          <button
            type="button"
            onClick={handleAddCard}
            disabled={isAddingCard}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {isAddingCard ? t('teacherFlashcardSetEditor.addingCard') : t('teacherFlashcardSetEditor.addCardButton')}
          </button>
        </div>

        {set.cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            {t('teacherFlashcardSetEditor.noCardsEmpty')}
          </div>
        ) : (
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
        )}
      </section>

      {/* Submissions Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-base font-bold text-slate-900">
            {t('teacherFlashcardSetEditor.submissionsHeading')}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{t('teacherFlashcardSetEditor.submissionsSubtitle')}</p>
        </div>

        {submissions === null ? (
          <p className="text-xs text-slate-400">{t('common.loading')}</p>
        ) : submissions.length === 0 ? (
          <p className="text-xs text-slate-400">{t('teacherFlashcardSetEditor.noSubmissions')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span>
                    {t('teacherFlashcardSetEditor.submissionWordPrefix', { name: s.studentName })}{' '}
                    <span className="font-semibold text-slate-800">{s.term}</span>
                  </span>
                  <span
                    className={
                      s.containsWord ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-400'
                    }
                  >
                    {s.containsWord
                      ? t('teacherFlashcardSetEditor.containsWord')
                      : t('teacherFlashcardSetEditor.missingWord')}
                  </span>
                </div>
                <p className="font-medium text-slate-800 text-sm mt-1">{s.sentence}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {new Date(s.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default TeacherFlashcardSetEditorPage;
