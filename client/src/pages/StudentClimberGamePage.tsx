import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GameWordDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';
import { shuffle, pickDecoys } from '../lib/vocabGameHelpers';
import VocabConfetti from '../components/VocabConfetti';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 340;
const BASE_Y = 280;
const TOP_MARGIN = 70;
const STEP_PX = 24;
const PLATFORM_Y_OFFSET = 95;
const PLATFORM_HALF_GAP = 95;
const PLATFORM_WIDTH = 120;
const PLATFORM_HEIGHT = 30;
const CLIMBER_RADIUS = 16;
const STARTING_LIVES = 3;
const MAX_ROUNDS = 8;
const ROUND_PAUSE_MS = 900;

type Side = 'left' | 'right';

interface Choice {
  cardId: string;
  label: string;
  isCorrect: boolean;
}

type Phase = 'loading' | 'unavailable' | 'error' | 'playing' | 'gameover';

/**
 * Vocab Climber (2026-10 "Vocab Studio" lineup, replacing the old space shooter/runner
 * pair): React + Canvas, no external game-engine library. Each round shows a target
 * MEANING and exactly two platforms — left and right, one labeled with the correct
 * term, one a decoy — the student picks a side (tap the platform, or ←/→). A correct
 * pick climbs the mountain one step higher; a wrong pick slips back down one step and
 * costs a life, but the climb continues either way (same "always advance" shape as
 * every other vocab game). Same `flashcardApi.completeGame('climber', ...)`
 * round-completion contract as every other vocab exercise.
 *
 * Deliberately a binary (not 3-way) choice, and the first of the three replacement
 * games to give visible, persistent feedback for being WRONG (falling height) rather
 * than just losing a heart — "how high did you climb" is a second, parallel score a
 * student can try to beat next time, distinct from the plain correct-count the other
 * games report.
 */
function StudentClimberGamePage() {
  const { t } = useTranslation();
  const strings = {
    loadFailed: t('studentClimberGame.loadFailed'),
    correctMessage: t('studentClimberGame.correctMessage'),
    wrongMessage: (label: string) => t('studentClimberGame.wrongMessage', { label }),
    livesNone: t('studentClimberGame.livesNone'),
  };
  const { setId } = useParams<{ setId: string }>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [bestHeight, setBestHeight] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(0);
  const [promptMeaning, setPromptMeaning] = useState('');
  const [roundMessage, setRoundMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'failed' | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const wordsRef = useRef<GameWordDTO[]>([]);
  const roundWordsRef = useRef<GameWordDTO[]>([]);
  const roundIndexRef = useRef(0);
  const choicesRef = useRef<{ left: Choice; right: Choice } | null>(null);
  const correctCardIdRef = useRef<string | null>(null);
  const heightRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const roundLockRef = useRef(false);
  const climberXRef = useRef(0); // -1 (left) .. 0 (center) .. 1 (right), eased
  const climberTargetXRef = useRef(0);
  const climberYRef = useRef(BASE_Y);
  const climberTargetYRef = useRef(BASE_Y);
  const flashRef = useRef<'correct' | 'wrong' | null>(null);
  const resultsRef = useRef<Array<{ cardId: string; correct: boolean }>>([]);
  const rafRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('loading');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function yForHeight(h: number): number {
    return Math.max(TOP_MARGIN, BASE_Y - h * STEP_PX);
  }

  function setupRound(index: number) {
    const target = roundWordsRef.current[index];
    const [decoy] = pickDecoys(wordsRef.current, target, 1);
    const onLeft = Math.random() < 0.5;
    const targetChoice: Choice = { cardId: target.cardId, label: target.term, isCorrect: true };
    const decoyChoice: Choice = { cardId: decoy.cardId, label: decoy.term, isCorrect: false };
    choicesRef.current = onLeft
      ? { left: targetChoice, right: decoyChoice }
      : { left: decoyChoice, right: targetChoice };
    correctCardIdRef.current = target.cardId;
    roundLockRef.current = false;
    flashRef.current = null;
    climberTargetXRef.current = 0;
    setPromptMeaning(target.meaning);
    setRoundMessage(null);
  }

  function finishGame() {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    if (!setId) return;
    setSaveStatus('saving');
    flashcardApi
      .completeGame(setId, 'climber', { results: resultsRef.current })
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('failed'));
  }

  function advanceOrEnd() {
    const nextIndex = roundIndexRef.current + 1;
    if (livesRef.current <= 0 || nextIndex >= roundWordsRef.current.length) {
      finishGame();
      return;
    }
    roundIndexRef.current = nextIndex;
    setRoundNumber(nextIndex + 1);
    setupRound(nextIndex);
    phaseRef.current = 'playing';
    setPhase('playing');
  }

  function choose(side: Side) {
    if (phaseRef.current !== 'playing' || roundLockRef.current || !choicesRef.current) return;
    const picked = choicesRef.current[side];
    roundLockRef.current = true;
    climberTargetXRef.current = side === 'left' ? -1 : 1;
    resultsRef.current.push({ cardId: correctCardIdRef.current!, correct: picked.isCorrect });
    setAnsweredCount(resultsRef.current.length);
    if (picked.isCorrect) {
      heightRef.current += 1;
      setBestHeight((b) => Math.max(b, heightRef.current));
      setScore((s) => s + 1);
      flashRef.current = 'correct';
      setRoundMessage(strings.correctMessage);
      setShowConfetti(true);
    } else {
      heightRef.current = Math.max(0, heightRef.current - 1);
      livesRef.current -= 1;
      setLives(livesRef.current);
      flashRef.current = 'wrong';
      const correctLabel =
        choicesRef.current.left.isCorrect ? choicesRef.current.left.label : choicesRef.current.right.label;
      setRoundMessage(strings.wrongMessage(correctLabel));
    }
    climberTargetYRef.current = yForHeight(heightRef.current);
    setTimeout(() => {
      setShowConfetti(false);
      // Recenter for the next round's two fresh platforms.
      climberTargetXRef.current = 0;
      advanceOrEnd();
    }, ROUND_PAUSE_MS);
  }

  // Load the set's word pool once, then start the game.
  useEffect(() => {
    if (!setId) return;
    flashcardApi
      .listGameWords(setId)
      .then((words) => {
        if (words.length < 2) {
          setPhase('unavailable');
          return;
        }
        wordsRef.current = words;
        roundWordsRef.current = shuffle(words).slice(0, Math.min(MAX_ROUNDS, words.length));
        setTotalRounds(roundWordsRef.current.length);
        roundIndexRef.current = 0;
        livesRef.current = STARTING_LIVES;
        heightRef.current = 0;
        climberXRef.current = 0;
        climberTargetXRef.current = 0;
        climberYRef.current = BASE_Y;
        climberTargetYRef.current = BASE_Y;
        resultsRef.current = [];
        setupRound(0);
        setPhase('playing');
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : strings.loadFailed);
        setPhase('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  // Keyboard controls.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') choose('left');
      else if (e.key === 'ArrowRight') choose('right');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render loop: eases the climber toward its target position every frame and redraws.
  useEffect(() => {
    function tick() {
      climberXRef.current += (climberTargetXRef.current - climberXRef.current) * 0.22;
      climberYRef.current += (climberTargetYRef.current - climberYRef.current) * 0.22;
      draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    function draw() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      // Dusk mountain sky.
      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      sky.addColorStop(0, '#dce9ff');
      sky.addColorStop(1, '#f3e9ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Mountain silhouette layers (purely decorative).
      ctx.fillStyle = 'rgba(167,139,250,0.25)';
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_HEIGHT);
      ctx.lineTo(0, 220);
      ctx.lineTo(120, 150);
      ctx.lineTo(240, 210);
      ctx.lineTo(360, 120);
      ctx.lineTo(480, 190);
      ctx.lineTo(480, CANVAS_HEIGHT);
      ctx.closePath();
      ctx.fill();

      const cx = CANVAS_WIDTH / 2 + climberXRef.current * PLATFORM_HALF_GAP;
      const cy = climberYRef.current;

      // Platforms for the CURRENT round (only while not mid-hop-away).
      const choices = choicesRef.current;
      if (choices && phaseRef.current === 'playing') {
        const py = cy - PLATFORM_Y_OFFSET;
        drawPlatform(ctx, CANVAS_WIDTH / 2 - PLATFORM_HALF_GAP, py, choices.left.label);
        drawPlatform(ctx, CANVAS_WIDTH / 2 + PLATFORM_HALF_GAP, py, choices.right.label);
      }

      // Current ledge the climber stands on.
      ctx.fillStyle = '#9b8465';
      ctx.beginPath();
      ctx.ellipse(cx, cy + CLIMBER_RADIUS + 6, 30, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Climber.
      const bodyColor = flashRef.current === 'wrong' ? '#e3342f' : flashRef.current === 'correct' ? '#38a169' : '#2563eb';
      ctx.save();
      ctx.shadowColor = bodyColor;
      ctx.shadowBlur = 10;
      const grad = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, CLIMBER_RADIUS);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, bodyColor);
      grad.addColorStop(1, bodyColor);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, CLIMBER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawPlatform(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
      const left = x - PLATFORM_WIDTH / 2;
      const top = y - PLATFORM_HEIGHT / 2;
      const grad = ctx.createLinearGradient(left, top, left, top + PLATFORM_HEIGHT);
      grad.addColorStop(0, '#fff4d6');
      grad.addColorStop(1, '#fbd98a');
      ctx.fillStyle = grad;
      roundRectPath(ctx, left, top, PLATFORM_WIDTH, PLATFORM_HEIGHT, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#5b4615';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + 4, PLATFORM_WIDTH - 12);
    }

    function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!setId) return null;

  return (
    <div className="vocab-zone vocab-canvas -mt-4 -mb-4 flex w-full max-w-xl flex-col gap-4 rounded-3xl p-4 sm:-mt-6 sm:-mb-6 sm:p-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('studentClimberGame.backToSet')}
        </Link>
        <h1 className="vocab-display text-lg font-bold text-primary-800">🧗 {t('studentClimberGame.title')}</h1>
      </div>

      {phase === 'loading' && <p className="text-center text-base-black/60">{t('common.loading')}</p>}

      {phase === 'error' && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {phase === 'unavailable' && (
        <p className="text-sm text-base-black/60">{t('studentClimberGame.unavailable')}</p>
      )}

      {(phase === 'playing' || phase === 'gameover') && (
        <>
          <div className="flex items-center justify-between rounded-2xl border-2 border-primary-100 bg-base-white px-4 py-2.5 text-sm font-bold text-base-black">
            <span>
              {t('studentClimberGame.roundLabel', {
                current: Math.min(roundNumber, totalRounds),
                total: totalRounds,
              })}
            </span>
            <span className="text-primary-700">{t('studentClimberGame.heightLabel', { height: bestHeight })}</span>
            <span>
              {t('studentClimberGame.livesLabel', {
                hearts: '❤️'.repeat(Math.max(lives, 0)) || strings.livesNone,
              })}
            </span>
          </div>

          <p className="text-center text-base font-semibold text-base-black">
            {t('studentClimberGame.promptLabel')} <span className="vocab-display text-primary-700">{promptMeaning}</span>
          </p>

          <div className="relative mx-auto w-full" style={{ maxWidth: CANVAS_WIDTH }}>
            {showConfetti && <VocabConfetti />}
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="mx-auto block w-full rounded-2xl border-4 border-primary-300 shadow-[0_10px_0_0_rgb(var(--color-primary-200))]"
              style={{ height: 'auto' }}
              aria-label={t('studentClimberGame.canvasLabel')}
            />
          </div>

          {roundMessage && (
            <p role="status" className="text-center text-sm font-bold text-base-black/80">
              {roundMessage}
            </p>
          )}

          {phase === 'playing' && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => choose('left')}
                className="vocab-btn-secondary border-2 border-primary-200 bg-base-white px-6 py-2.5 text-sm text-primary-700"
              >
                {t('studentClimberGame.goLeft')}
              </button>
              <button
                type="button"
                onClick={() => choose('right')}
                className="vocab-btn-secondary border-2 border-primary-200 bg-base-white px-6 py-2.5 text-sm text-primary-700"
              >
                {t('studentClimberGame.goRight')}
              </button>
            </div>
          )}
          <p className="text-center text-xs text-base-black/50">{t('studentClimberGame.keyboardHint')}</p>

          {phase === 'gameover' && (
            <div className="vocab-anim-pop relative overflow-hidden rounded-3xl border-2 border-primary-200 bg-base-white p-6 text-center shadow-[0_8px_0_0_rgb(var(--color-primary-100))]">
              {lives > 0 && <VocabConfetti />}
              <span className="text-4xl">{lives > 0 ? '🏆' : '🧗'}</span>
              <h2 className="vocab-display mt-1 text-lg font-bold text-primary-800">
                {lives > 0 ? t('studentClimberGame.climbCompleteHeading') : t('studentClimberGame.gameOverHeading')}
              </h2>
              <p className="mt-1 text-base-black/70">
                {t('studentClimberGame.finalScoreLine', { score, answered: answeredCount })}
              </p>
              <p className="vocab-display mt-1 text-2xl font-bold text-primary-700">
                {t('studentClimberGame.bestHeightLine', { height: bestHeight })}
              </p>
              <p className="text-xs text-base-black/50">
                {saveStatus === 'saving' && t('studentClimberGame.saving')}
                {saveStatus === 'saved' && t('studentClimberGame.saved')}
                {saveStatus === 'failed' && t('studentClimberGame.saveFailed')}
              </p>
              <div className="mt-3 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="vocab-btn-primary bg-primary-500 px-5 py-2.5 text-sm text-base-white"
                >
                  {t('studentClimberGame.playAgain')}
                </button>
                <Link
                  to={`/student/flashcard-sets/${setId}`}
                  className="vocab-btn-secondary border-2 border-primary-200 bg-base-white px-5 py-2.5 text-sm text-primary-700"
                >
                  {t('studentClimberGame.backToSetButton')}
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentClimberGamePage;
