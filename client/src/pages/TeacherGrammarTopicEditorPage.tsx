import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GrammarTopicDetailDTO, UnitDTO, UpdateGrammarExerciseRequest } from '@platform/shared';
import { teacherApi } from '../lib/teacherApi';
import { ApiError } from '../lib/apiClient';
import GrammarExerciseEditor from '../components/GrammarExerciseEditor';

/** Default new-exercise shape — a sensible, editable placeholder, same convention as
 * `TeacherFlashcardSetEditorPage.tsx`'s `defaultCardBody`. */
function defaultExerciseBody(): UpdateGrammarExerciseRequest {
  return {
    type: 'multipleChoice',
    prompt: 'New exercise prompt',
    choices: [
      { text: 'Correct answer', isCorrect: true },
      { text: 'Wrong answer', isCorrect: false },
    ],
  };
}

/**
 * Grammar topic editor (T-046/T-047/T-048): edit the topic's title/theory content/unit
 * tag, and add/edit/delete practice exercises. Same structure as
 * `TeacherFlashcardSetEditorPage.tsx`/`TeacherTestEditorPage.tsx`.
 */
function TeacherGrammarTopicEditorPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const [topic, setTopic] = useState<GrammarTopicDetailDTO | null>(null);
  const [title, setTitle] = useState('');
  const [theoryContent, setTheoryContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitDTO[]>([]);
  const [isAddingExercise, setIsAddingExercise] = useState(false);

  const refresh = useCallback(() => {
    if (!topicId) return;
    teacherApi
      .getGrammarTopic(topicId)
      .then((data) => {
        setTopic(data);
        setTitle(data.title);
        setTheoryContent(data.theoryContent);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load Grammar topic.'));
  }, [topicId]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    teacherApi
      .listUnits()
      .then(setUnits)
      .catch(() => undefined);
  }, []);

  if (!topicId) return null;

  async function handleSaveTitleAndTheory() {
    if (!topic) return;
    if (title.trim() === '' || theoryContent.trim() === '') return;
    if (title === topic.title && theoryContent === topic.theoryContent) return;
    try {
      const updated = await teacherApi.updateGrammarTopic(topicId!, {
        title: title.trim(),
        theoryContent: theoryContent.trim(),
      });
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save topic.');
    }
  }

  async function handleSaveUnit(unitId: string | null) {
    if (!topic) return;
    try {
      const updated = await teacherApi.updateGrammarTopic(topicId!, {
        title: topic.title,
        theoryContent: topic.theoryContent,
        unitId,
      });
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save unit tag.');
    }
  }

  async function handleAddExercise() {
    setIsAddingExercise(true);
    setError(null);
    try {
      const updated = await teacherApi.createGrammarExercise(topicId!, defaultExerciseBody());
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add exercise.');
    } finally {
      setIsAddingExercise(false);
    }
  }

  async function handleSaveExercise(exerciseId: string, body: UpdateGrammarExerciseRequest) {
    const updated = await teacherApi.updateGrammarExercise(topicId!, exerciseId, body);
    setTopic(updated);
  }

  async function handleDeleteExercise(exerciseId: string) {
    try {
      const updated = await teacherApi.deleteGrammarExercise(topicId!, exerciseId);
      setTopic(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete exercise.');
    }
  }

  if (!topic) {
    return (
      <div>
        <Link to="/teacher/grammar-topics" className="text-sm text-primary-600 hover:underline">
          ← Back to my Grammar topics
        </Link>
        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <p className="mt-4 text-sm text-base-black/60">Loading...</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to="/teacher/grammar-topics" className="text-sm text-primary-600 hover:underline">
          ← Back to my Grammar topics
        </Link>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={handleSaveTitleAndTheory}
          className="mt-2 w-full rounded-md border border-primary-200 px-3 py-2 text-2xl font-bold text-primary-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-base-black">
            Unit (optional)
            <select
              value={topic.unitId ?? ''}
              onChange={(event) => handleSaveUnit(event.target.value === '' ? null : event.target.value)}
              className="rounded-md border border-primary-200 px-3 py-1.5 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              <option value="">No unit</option>
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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-base-black">Theory content</h2>
        <p className="text-sm text-base-black/60">
          Plain text with paragraphs (separate paragraphs with a blank line) — no rich-text editor.
        </p>
        <textarea
          value={theoryContent}
          onChange={(event) => setTheoryContent(event.target.value)}
          onBlur={handleSaveTitleAndTheory}
          rows={10}
          className="rounded-md border border-primary-200 px-3 py-2 text-sm text-base-black focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-base-black">Practice exercises</h2>
        {topic.exercises.length === 0 && (
          <p className="text-sm text-base-black/60">No exercises yet — add one below.</p>
        )}
        <div className="flex flex-col gap-3">
          {topic.exercises.map((exercise, index) => (
            <GrammarExerciseEditor
              key={exercise.id}
              exercise={exercise}
              index={index}
              onSave={(body) => handleSaveExercise(exercise.id, body)}
              onDelete={() => handleDeleteExercise(exercise.id)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddExercise}
          disabled={isAddingExercise}
          className="self-start rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAddingExercise ? 'Adding...' : '+ Add exercise'}
        </button>
      </section>
    </div>
  );
}

export default TeacherGrammarTopicEditorPage;
