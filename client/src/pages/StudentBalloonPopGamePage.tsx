import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GameWordDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';
import { shuffle, pickDecoys } from '../lib/vocabGameHelpers';
import VocabConfetti from '../components/VocabConfetti';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;
const BALLOON_RADIUS = 34;
const RISE_SPEED = 48; // px/s — slow enough to read the label before it's gone
const STARTING_LIVES = 3;
const MAX_ROUNDS = 8;
const ROUND_PAUSE_MS = 900;
const BALLOON_COLORS = ['#f97362', '#60a5fa', '#34d399', '#fbbf24', '#c084fc'];

interface Balloon {
  cardId: string;
  label: string;
  isCorrect: boolean;
  x: number;
  y: number;
  wobblePhase: number;
  color: string;
  popped: 'correct' | 'wrong' | null;
  poppedAt: number | null;
}

type Phase = 'loading' | 'unavailable' | 'error' | 'playing' | 'gameover';

/**
 * Vocab Balloon Pop (2026-10 "Vocab Studio" lineup, replacing the old space shooter):
 * React + Canvas, no external game-engine library. Each round shows a target MEANING;
 * three balloons (one correct term, two decoys) drift upward from random starting
 * positions — tap/click directly on the correct one to pop it before it floats off the
 * top of the screen. A wrong tap pops the wrong balloon and costs a life; a balloon
 * reaching the top unpopped also costs a life if it was the correct one (a decoy
 * floating away is harmless). Same `flashcardApi.completeGame('balloonPop', ...)`
 * round-completion contract as every other vocab exercise.
 *
 * Deliberately a DIRECT-POINTER mechanic (tap the thing itself, continuous position) —
 * unlike the fixed-lane/fixed-hole mechanics of the other two replacement games, this
 * one is about tracking a moving target and committing to a tap, closer to a classic
 * "whack the right fruit" arcade feel.
 */
function StudentBalloonPopGamePage() {
  const { t } = useTranslation();
  const strings = {
    loadFailed: t('studentBalloonPopGame.loadFailed'),
    correctMessage: t('studentBalloonPopGame.correctMessage'),
    wrongMessage: (label: string) => t('studentBalloonPopGame.wrongMessage', { label }),
    missedMessage: (label: string) => t('studentBalloonPopGame.missedMessage', { label }),
    livesNone: t('studentBalloonPopGame.livesNone'),
  };
  const { setId } = useParams<{ setId: string }>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
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
  const balloonsRef = useRef<Balloon[]>([]);
  const correctCardIdRef = useRef<string | null>(null);
  const livesRef = useRef(STARTING_LIVES);
  const roundLockRef = useRef(false);
  const resultsRef = useRef<Array<{ cardId: string; correct: boolean }>>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('loading');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function setupRound(index: number) {
    const target = roundWordsRef.current[index];
    const decoys = pickDecoys(wordsRef.current, target, 2);
    const words = shuffle([target, ...decoys]);
    const slotWidth = CANVAS_WIDTH / words.length;
    balloonsRef.current = words.map((w, i) => ({
      cardId: w.cardId,
      label: w.term,
      isCorrect: w.cardId === target.cardId,
      x: slotWidth * i + slotWidth / 2 + (Math.random() - 0.5) * (slotWidth * 0.3),
      y: CANVAS_HEIGHT + BALLOON_RADIUS + Math.random() * 80,
      wobblePhase: Math.random() * Math.PI * 2,
      color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
      popped: null,
      poppedAt: null,
    }));
    correctCardIdRef.current = target.cardId;
    roundLockRef.current = false;
    setPromptMeaning(target.meaning);
    setRoundMessage(null);
  }

  function finishGame() {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    if (!setId) return;
    setSaveStatus('saving');
    flashcardApi
      .completeGame(setId, 'balloonPop', { results: resultsRef.current })
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

  function resolveRound(correct: boolean, reason?: 'wrong' | 'missed', correctLabel?: string) {
    resultsRef.current.push({ cardId: correctCardIdRef.current!, correct });
    setAnsweredCount(resultsRef.current.length);
    if (correct) {
      setScore((s) => s + 1);
      setRoundMessage(strings.correctMessage);
      setShowConfetti(true);
    } else {
      livesRef.current -= 1;
      setLives(livesRef.current);
      setRoundMessage(
        reason === 'missed' ? strings.missedMessage(correctLabel ?? '') : strings.wrongMessage(correctLabel ?? ''),
      );
    }
    roundLockRef.current = true;
    setTimeout(() => {
      setShowConfetti(false);
      advanceOrEnd();
    }, ROUND_PAUSE_MS);
  }

  function popBalloon(balloon: Balloon) {
    if (phaseRef.current !== 'playing' || roundLockRef.current) return;
    if (balloon.popped) return;
    balloon.popped = balloon.isCorrect ? 'correct' : 'wrong';
    balloon.poppedAt = performance.now();
    if (balloon.isCorrect) {
      resolveRound(true);
    } else {
      const correctLabel = balloonsRef.current.find((b) => b.isCorrect)?.label ?? '';
      resolveRound(false, 'wrong', correctLabel);
    }
  }

  function handleCanvasClick(event: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    for (const balloon of balloonsRef.current) {
      if (balloon.popped) continue;
      const dx = x - balloon.x;
      const dy = y - balloon.y;
      if (dx * dx + dy * dy <= BALLOON_RADIUS * BALLOON_RADIUS) {
        popBalloon(balloon);
        return;
      }
    }
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

  // Keyboard alternative: 1/2/3 map to the currently-visible, unpopped balloons ordered
  // left-to-right by their current X position.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 3) return;
      if (phaseRef.current !== 'playing' || roundLockRef.current) return;
      const ordered = [...balloonsRef.current].filter((b) => !b.popped).sort((a, b) => a.x - b.x);
      const target = ordered[n - 1];
      if (target) popBalloon(target);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render loop: rises balloons, resolves a correct-balloon-escaped miss, redraws.
  useEffect(() => {
    function tick(ts: number) {
      const dt = lastTsRef.current == null ? 0 : (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      if (phaseRef.current === 'playing' && !roundLockRef.current) {
        for (const balloon of balloonsRef.current) {
          if (balloon.popped) continue;
          balloon.y -= RISE_SPEED * dt;
        }
        const escapedCorrect = balloonsRef.current.find(
          (b) => !b.popped && b.isCorrect && b.y < -BALLOON_RADIUS,
        );
        if (escapedCorrect) {
          resolveRound(false, 'missed', escapedCorrect.label);
        }
      }

      draw(ts);
      rafRef.current = requestAnimationFrame(tick);
    }

    function draw(ts: number) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      sky.addColorStop(0, '#fff1f7');
      sky.addColorStop(1, '#ffe4ef');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (const balloon of balloonsRef.current) {
        const wobble = Math.sin(ts / 500 + balloon.wobblePhase) * 6;
        const x = balloon.x + wobble;
        const y = balloon.y;
        let scale = 1;
        let alpha = 1;
        if (balloon.popped && balloon.poppedAt !== null) {
          const since = performance.now() - balloon.poppedAt;
          scale = 1 + since / 120;
          alpha = Math.max(0, 1 - since / 220);
          if (alpha <= 0) continue;
        }
        if (y < -BALLOON_RADIUS * 2 && !balloon.popped) continue;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        // String.
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, BALLOON_RADIUS);
        ctx.lineTo(0, BALLOON_RADIUS + 18);
        ctx.stroke();

        // Balloon body.
        const color = balloon.popped === 'wrong' ? '#e3342f' : balloon.popped === 'correct' ? '#38a169' : balloon.color;
        const grad = ctx.createRadialGradient(-10, -12, 4, 0, 0, BALLOON_RADIUS);
        grad.addColorStop(0, 'rgba(255,255,255,0.85)');
        grad.addColorStop(0.25, color);
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, BALLOON_RADIUS * 0.86, BALLOON_RADIUS, 0, 0, Math.PI * 2);
        ctx.fill();
        // Knot.
        ctx.beginPath();
        ctx.moveTo(-4, BALLOON_RADIUS - 2);
        ctx.lineTo(4, BALLOON_RADIUS - 2);
        ctx.lineTo(0, BALLOON_RADIUS + 5);
        ctx.closePath();
        ctx.fill();

        // Label chip.
        if (!balloon.popped) {
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          const chipW = Math.min(76, 16 + balloon.label.length * 6);
          ctx.beginPath();
          ctx.ellipse(0, 0, chipW / 2, 13, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1a1030';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(balloon.label, 0, 4, chipW - 6);
        }
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!setId) return null;

  return (
    <div className="vocab-zone vocab-canvas -mt-4 -mb-4 flex w-full max-w-xl flex-col gap-4 rounded-3xl p-4 sm:-mt-6 sm:-mb-6 sm:p-6">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          {t('studentBalloonPopGame.backToSet')}
        </Link>
        <h1 className="vocab-display text-lg font-bold text-primary-800">🎈 {t('studentBalloonPopGame.title')}</h1>
      </div>

      {phase === 'loading' && <p className="text-center text-base-black/60">{t('common.loading')}</p>}

      {phase === 'error' && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {phase === 'unavailable' && (
        <p className="text-sm text-base-black/60">{t('studentBalloonPopGame.unavailable')}</p>
      )}

      {(phase === 'playing' || phase === 'gameover') && (
        <>
          <div className="flex items-center justify-between rounded-2xl border-2 border-primary-100 bg-base-white px-4 py-2.5 text-sm font-bold text-base-black">
            <span>
              {t('studentBalloonPopGame.roundLabel', {
                current: Math.min(roundNumber, totalRounds),
                total: totalRounds,
              })}
            </span>
            <span className="text-primary-700">{t('studentBalloonPopGame.scoreLabel', { score })}</span>
            <span>
              {t('studentBalloonPopGame.livesLabel', {
                hearts: '❤️'.repeat(Math.max(lives, 0)) || strings.livesNone,
              })}
            </span>
          </div>

          <p className="text-center text-base font-semibold text-base-black">
            {t('studentBalloonPopGame.promptLabel')} <span className="vocab-display text-primary-700">{promptMeaning}</span>
          </p>

          <div className="relative mx-auto w-full" style={{ maxWidth: CANVAS_WIDTH }}>
            {showConfetti && <VocabConfetti />}
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onClick={handleCanvasClick}
              className="mx-auto block w-full cursor-pointer rounded-2xl border-4 border-primary-300 shadow-[0_10px_0_0_rgb(var(--color-primary-200))]"
              style={{ height: 'auto' }}
              aria-label={t('studentBalloonPopGame.canvasLabel')}
            />
          </div>

          {roundMessage && (
            <p role="status" className="text-center text-sm font-bold text-base-black/80">
              {roundMessage}
            </p>
          )}

          <p className="text-center text-xs text-base-black/50">{t('studentBalloonPopGame.keyboardHint')}</p>

          {phase === 'gameover' && (
            <div className="vocab-anim-pop relative overflow-hidden rounded-3xl border-2 border-primary-200 bg-base-white p-6 text-center shadow-[0_8px_0_0_rgb(var(--color-primary-100))]">
              {lives > 0 && <VocabConfetti />}
              <span className="text-4xl">{lives > 0 ? '🏆' : '🎈'}</span>
              <h2 className="vocab-display mt-1 text-lg font-bold text-primary-800">
                {lives > 0
                  ? t('studentBalloonPopGame.roundCompleteHeading')
                  : t('studentBalloonPopGame.gameOverHeading')}
              </h2>
              <p className="mt-1 text-base-black/70">
                {t('studentBalloonPopGame.finalScoreLine', { score, answered: answeredCount })}
              </p>
              <p className="text-xs text-base-black/50">
                {saveStatus === 'saving' && t('studentBalloonPopGame.saving')}
                {saveStatus === 'saved' && t('studentBalloonPopGame.saved')}
                {saveStatus === 'failed' && t('studentBalloonPopGame.saveFailed')}
              </p>
              <div className="mt-3 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="vocab-btn-primary bg-primary-500 px-5 py-2.5 text-sm text-base-white"
                >
                  {t('studentBalloonPopGame.playAgain')}
                </button>
                <Link
                  to={`/student/flashcard-sets/${setId}`}
                  className="vocab-btn-secondary border-2 border-primary-200 bg-base-white px-5 py-2.5 text-sm text-primary-700"
                >
                  {t('studentBalloonPopGame.backToSetButton')}
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentBalloonPopGamePage;
