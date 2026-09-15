import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GrammarTopicProgressDTO, StudentGrammarTopicDetailDTO } from '@platform/shared';
import { grammarApi } from '../lib/grammarApi';
import { ApiError } from '../lib/apiClient';

/**
 * Grammar topic reading page (T-047): theory content plus links out to practice
 * exercises (T-048) and the Grammar game (T-049) — same "read, then practice, then
 * play" layout as `StudentFlashcardSetPage.tsx`. `theoryContent` is plain text with
 * paragraphs separated by a blank line (matching `Section.passageText`'s convention),
 * rendered here as one `<p>` per paragraph — no rich-text/markdown parsing.
 */
function StudentGrammarTopicPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const { t } = useTranslation();
  const [topic, setTopic] = useState<StudentGrammarTopicDetailDTO | null>(null);
  const [progress, setProgress] = useState<GrammarTopicProgressDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topicId) return;
    grammarApi
      .getTopic(topicId)
      .then(setTopic)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('studentGrammarTopic.loadFailed')));
    grammarApi
      .getProgress(topicId)
      .then(setProgress)
      .catch(() => undefined);
  }, [topicId, t]);

  if (!topicId) return null;

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-md rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!topic) {
    return <p className="text-center text-base-black/60">{t('common.loading')}</p>;
  }

  const paragraphs = topic.theoryContent.split(/\n\s*\n/).filter((p) => p.trim() !== '');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to="/student/grammar-topics" className="text-sm text-primary-600 hover:underline">
          {t('studentGrammarTopic.backToGrammar')}
        </Link>
        {topic.unitName && (
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
            {topic.unitName}
          </span>
        )}
      </div>

      <h1 className="text-2xl font-bold text-primary-700">{topic.title}</h1>

      <section className="flex flex-col gap-3 rounded-xl border border-primary-200 bg-primary-50 p-6">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line text-base-black">
            {paragraph}
          </p>
        ))}
      </section>

      {progress && progress.attemptedCount > 0 && (
        <p className="text-sm text-base-black/60">
          {t('studentGrammarTopic.progressText', {
            correct: progress.correctCount,
            attempted: progress.attemptedCount,
            percent: Math.round((progress.correctCount / progress.attemptedCount) * 100),
          })}
        </p>
      )}

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">{t('studentGrammarTopic.practiceHeading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('studentGrammarTopic.practiceSubtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={`/student/grammar-topics/${topicId}/practice`}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            {t('studentGrammarTopic.startPractice')}
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-primary-200 p-4">
        <h2 className="text-lg font-bold text-base-black">{t('studentGrammarTopic.gameHeading')}</h2>
        <p className="mt-1 text-sm text-base-black/60">{t('studentGrammarTopic.gameSubtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={`/student/grammar-topics/${topicId}/games/space-shooter`}
            className="rounded-md border border-primary-300 bg-base-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            {t('studentGrammarTopic.spaceShooter')}
          </Link>
        </div>
      </section>
    </div>
  );
}

export default StudentGrammarTopicPage;
