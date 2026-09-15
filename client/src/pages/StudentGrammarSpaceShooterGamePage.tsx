import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GrammarGameQuestionDTO } from '@platform/shared';
import { grammarApi } from '../lib/grammarApi';
import { ApiError } from '../lib/apiClient';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const LANE_X = [30, 180, 330];
const LANE_WIDTH = 120;
const LANE_CENTER = LANE_X.map((x) => x + LANE_WIDTH / 2);
const SHIP_Y = 320;
const SHIP_WIDTH = 36;
const SHIP_HEIGHT = 22;
const TARGET_ROW_Y = 50;
const TARGET_HEIGHT = 40;
const TARGET_FALL_SPEED = 26; // px/s — slow, readable descent
const BULLET_SPEED = 260; // px/s
const STARTING_LIVES = 3;
const MAX_ROUNDS = 8;
const ROUND_PAUSE_MS = 900;

interface LaneTarget {
  exerciseId: string;
  label: string;
  lane: number;
  y: number;
}

interface Bullet {
  lane: number;
  y: number;
  correct: boolean;
}

type Phase = 'loading' | 'unavailable' | 'error' | 'playing' | 'gameover';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Builds this round's 2 decoy answer texts: prefer the target exercise's OWN wrong
 * choices first (the natural decoy source for a multipleChoice/trueFalse exercise — see
 * `GrammarGameQuestionDTO`'s doc comment), padding from OTHER exercises' answers only
 * when the target doesn't have enough wrong choices of its own (e.g. a `trueFalse`
 * exercise only has exactly one). */
function pickDecoys(questions: GrammarGameQuestionDTO[], target: GrammarGameQuestionDTO, n: number): string[] {
  const ownDecoys = shuffle(target.wrongAnswers.filter((w) => w !== target.correctAnswer));
  const decoys = [...ownDecoys];
  if (decoys.length < n) {
    const pool = shuffle(
      questions
        .filter((q) => q.exerciseId !== target.exerciseId)
        .flatMap((q) => [q.correctAnswer, ...q.wrongAnswers])
        .filter((text) => text !== target.correctAnswer && !decoys.includes(text)),
    );
    for (const text of pool) {
      if (decoys.length >= n) break;
      decoys.push(text);
    }
  }
  // Still short (a tiny topic with almost no distinct answer text anywhere) — pad with
  // the target's own correct answer repeated rather than crash; visually harmless since
  // lanes then just show a repeated label, same "pad with repeats" fallback as the vocab
  // space shooter's `pickDecoys`.
  while (decoys.length < n) decoys.push(target.correctAnswer);
  return decoys.slice(0, n);
}

/**
 * Grammar space-shooter game (T-049): adapts the vocab space-shooter's Canvas/React
 * structure (T-034, `StudentSpaceShooterGamePage.tsx`) to Grammar exercise content
 * instead of vocabulary words. Each round shows one exercise's `prompt` (the grammar
 * question text); three lanes hold falling "ships" labeled with candidate answers (one
 * correct, two decoys — see `pickDecoys` above). Same win/lose + progress-recording
 * behavior as the vocab game: a correct hit scores a point and advances, a wrong hit
 * costs a life and still advances, the round ends after `MAX_ROUNDS` questions or 0
 * lives, and completion reports one correct/incorrect verdict per exercise played via
 * `grammarApi.completeGame` — persisted server-side as `GrammarExerciseAttempt` rows,
 * the same log T-048's practice-exercise check endpoint writes to (T-050's reporting
 * counts both sources identically).
 *
 * Only `multipleChoice`/`trueFalse` exercises are eligible (the server's
 * `/game-questions` endpoint already filters this — see `studentGrammar.routes.ts`).
 */
function StudentGrammarSpaceShooterGamePage() {
  const { topicId } = useParams<{ topicId: string }>();
  const { t } = useTranslation();
  // Resolved once per render from the stable `t` function (hooks can't be called inside
  // the game-loop/canvas code below, so every user-visible string this game logic needs
  // is turned into a plain value here first, then referenced by the imperative code).
  const correctFeedbackText = t('studentGrammarSpaceShooterGame.roundMessageCorrect');
  const loadFailedText = t('studentGrammarSpaceShooterGame.loadFailed');
  const livesNoneText = t('studentGrammarSpaceShooterGame.livesNone');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(0);
  const [promptText, setPromptText] = useState('');
  const [roundMessage, setRoundMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'failed' | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);

  const questionsRef = useRef<GrammarGameQuestionDTO[]>([]);
  const roundQuestionsRef = useRef<GrammarGameQuestionDTO[]>([]);
  const roundIndexRef = useRef(0);
  const targetsRef = useRef<LaneTarget[]>([]);
  const correctExerciseIdRef = useRef<string | null>(null);
  const laneRef = useRef(1);
  const bulletRef = useRef<Bullet | null>(null);
  const livesRef = useRef(STARTING_LIVES);
  const roundLockRef = useRef(false);
  const resultsRef = useRef<Array<{ exerciseId: string; correct: boolean }>>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('loading');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function setupRound(index: number) {
    const target = roundQuestionsRef.current[index];
    const decoys = pickDecoys(questionsRef.current, target, 2);
    const laneAnswers = shuffle([target.correctAnswer, ...decoys]);
    targetsRef.current = laneAnswers.map((label, lane) => ({
      exerciseId: label === target.correctAnswer ? target.exerciseId : `decoy-${lane}`,
      label,
      lane,
      y: TARGET_ROW_Y,
    }));
    correctExerciseIdRef.current = target.exerciseId;
    bulletRef.current = null;
    roundLockRef.current = false;
    setPromptText(target.prompt);
    setRoundMessage(null);
  }

  function finishGame() {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    if (!topicId) return;
    setSaveStatus('saving');
    grammarApi
      .completeGame(topicId, 'spaceShooter', { results: resultsRef.current })
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('failed'));
  }

  function advanceOrEnd() {
    const nextIndex = roundIndexRef.current + 1;
    if (livesRef.current <= 0 || nextIndex >= roundQuestionsRef.current.length) {
      finishGame();
      return;
    }
    roundIndexRef.current = nextIndex;
    setRoundNumber(nextIndex + 1);
    setupRound(nextIndex);
    phaseRef.current = 'playing';
    setPhase('playing');
  }

  function resolveBulletHit(bullet: Bullet) {
    resultsRef.current.push({ exerciseId: correctExerciseIdRef.current!, correct: bullet.correct });
    setAnsweredCount(resultsRef.current.length);
    if (bullet.correct) {
      setScore((s) => s + 1);
      setRoundMessage(correctFeedbackText);
    } else {
      livesRef.current -= 1;
      setLives(livesRef.current);
      const correctTarget = targetsRef.current.find((target) => target.exerciseId === correctExerciseIdRef.current);
      setRoundMessage(
        t('studentGrammarSpaceShooterGame.roundMessageIncorrect', { answer: correctTarget?.label ?? '' }),
      );
    }
    roundLockRef.current = true;
    setTimeout(advanceOrEnd, ROUND_PAUSE_MS);
  }

  function fire() {
    if (phaseRef.current !== 'playing' || roundLockRef.current || bulletRef.current) return;
    const hit = targetsRef.current.find((target) => target.lane === laneRef.current);
    bulletRef.current = {
      lane: laneRef.current,
      y: SHIP_Y,
      correct: hit?.exerciseId === correctExerciseIdRef.current,
    };
  }

  function moveLane(delta: number) {
    if (phaseRef.current !== 'playing') return;
    laneRef.current = Math.max(0, Math.min(2, laneRef.current + delta));
  }

  // Load the topic's eligible question pool once, then start the game.
  useEffect(() => {
    if (!topicId) return;
    grammarApi
      .listGameQuestions(topicId)
      .then((questions) => {
        if (questions.length < 2) {
          setPhase('unavailable');
          return;
        }
        questionsRef.current = questions;
        roundQuestionsRef.current = shuffle(questions).slice(0, Math.min(MAX_ROUNDS, questions.length));
        setTotalRounds(roundQuestionsRef.current.length);
        roundIndexRef.current = 0;
        livesRef.current = STARTING_LIVES;
        resultsRef.current = [];
        setupRound(0);
        setPhase('playing');
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : loadFailedText);
        setPhase('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  // Keyboard controls.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') moveLane(-1);
      else if (e.key === 'ArrowRight') moveLane(1);
      else if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        fire();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // The render loop: runs continuously from mount to unmount, reading/writing only
  // refs so it never needs to be torn down and restarted as state changes.
  useEffect(() => {
    function tick(ts: number) {
      const dt = lastTsRef.current == null ? 0 : (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      if (phaseRef.current === 'playing') {
        for (const target of targetsRef.current) {
          target.y += TARGET_FALL_SPEED * dt;
          if (target.y > CANVAS_HEIGHT) target.y = -TARGET_HEIGHT;
        }
        if (bulletRef.current) {
          bulletRef.current.y -= BULLET_SPEED * dt;
          if (bulletRef.current.y <= TARGET_ROW_Y + TARGET_HEIGHT / 2) {
            const b = bulletRef.current;
            bulletRef.current = null;
            resolveBulletHit(b);
          }
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    function draw() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.fillStyle = '#1a1030';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (const target of targetsRef.current) {
        ctx.fillStyle = '#f8b4a3';
        ctx.fillRect(LANE_X[target.lane], target.y, LANE_WIDTH, TARGET_HEIGHT);
        ctx.fillStyle = '#1a1030';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        wrapText(
          ctx,
          target.label,
          LANE_X[target.lane] + LANE_WIDTH / 2,
          target.y + TARGET_HEIGHT / 2 + 4,
          LANE_WIDTH - 10,
        );
      }

      const shipCenterX = LANE_CENTER[laneRef.current];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(shipCenterX, SHIP_Y - SHIP_HEIGHT / 2);
      ctx.lineTo(shipCenterX - SHIP_WIDTH / 2, SHIP_Y + SHIP_HEIGHT / 2);
      ctx.lineTo(shipCenterX + SHIP_WIDTH / 2, SHIP_Y + SHIP_HEIGHT / 2);
      ctx.closePath();
      ctx.fill();

      if (bulletRef.current) {
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(LANE_CENTER[bulletRef.current.lane] - 2, bulletRef.current.y, 4, 12);
      }
    }

    function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
      const words = text.split(' ');
      let line = '';
      const lines: string[] = [];
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
      const startY = y - ((lines.length - 1) * 14) / 2;
      lines.forEach((l, i) => ctx.fillText(l, x, startY + i * 14));
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!topicId) return null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to={`/student/grammar-topics/${topicId}`} className="text-sm text-primary-600 hover:underline">
          {t('studentGrammarSpaceShooterGame.backToTopic')}
        </Link>
        <h1 className="text-lg font-bold text-primary-700">{t('studentGrammarSpaceShooterGame.heading')}</h1>
      </div>

      {phase === 'loading' && <p className="text-center text-base-black/60">{t('common.loading')}</p>}

      {phase === 'error' && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {phase === 'unavailable' && (
        <p className="text-sm text-base-black/60">{t('studentGrammarSpaceShooterGame.unavailable')}</p>
      )}

      {(phase === 'playing' || phase === 'gameover') && (
        <>
          <div className="flex items-center justify-between text-sm font-semibold text-base-black">
            <span>
              {t('studentGrammarSpaceShooterGame.roundCounter', {
                current: Math.min(roundNumber, totalRounds),
                total: totalRounds,
              })}
            </span>
            <span>{t('studentGrammarSpaceShooterGame.scoreLabel', { score })}</span>
            <span>
              {t('studentGrammarSpaceShooterGame.livesLabel', {
                status: '❤️'.repeat(Math.max(lives, 0)) || livesNoneText,
              })}
            </span>
          </div>

          <p className="text-center text-base font-semibold text-base-black">{promptText}</p>

          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="mx-auto rounded-lg border border-primary-300"
            aria-label={t('studentGrammarSpaceShooterGame.canvasAriaLabel')}
          />

          {roundMessage && (
            <p role="status" className="text-center text-sm font-medium text-base-black/80">
              {roundMessage}
            </p>
          )}

          {phase === 'playing' && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => moveLane(-1)}
                className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
              >
                {t('studentGrammarSpaceShooterGame.moveLeft')}
              </button>
              <button
                type="button"
                onClick={fire}
                className="rounded-md bg-primary-500 px-6 py-2 text-sm font-semibold text-base-white hover:bg-primary-600"
              >
                {t('studentGrammarSpaceShooterGame.fire')}
              </button>
              <button
                type="button"
                onClick={() => moveLane(1)}
                className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
              >
                {t('studentGrammarSpaceShooterGame.moveRight')}
              </button>
            </div>
          )}
          <p className="text-center text-xs text-base-black/50">
            {t('studentGrammarSpaceShooterGame.keyboardHint')}
          </p>

          {phase === 'gameover' && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
              <h2 className="text-lg font-bold text-primary-700">
                {lives > 0
                  ? t('studentGrammarSpaceShooterGame.roundComplete')
                  : t('studentGrammarSpaceShooterGame.gameOver')}
              </h2>
              <p className="text-base-black/70">
                {t('studentGrammarSpaceShooterGame.finalScore', { score, answered: answeredCount })}
              </p>
              <p className="text-xs text-base-black/50">
                {saveStatus === 'saving' && t('studentGrammarSpaceShooterGame.saving')}
                {saveStatus === 'saved' && t('studentGrammarSpaceShooterGame.saved')}
                {saveStatus === 'failed' && t('studentGrammarSpaceShooterGame.saveFailed')}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white hover:bg-primary-600"
                >
                  {t('studentGrammarSpaceShooterGame.playAgain')}
                </button>
                <Link
                  to={`/student/grammar-topics/${topicId}`}
                  className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
                >
                  {t('studentGrammarSpaceShooterGame.backToTopicButton')}
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentGrammarSpaceShooterGamePage;
