import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GameWordDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';
import { shuffle, pickDecoys } from '../lib/vocabGameHelpers';
import VocabConfetti from '../components/VocabConfetti';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 340;
const HOLE_COLS = 3;
const HOLE_ROWS = 2;
const HOLE_RADIUS = 56;
const HOLE_X = [90, 240, 390];
const HOLE_Y = [110, 250];
const STARTING_LIVES = 3;
const MAX_ROUNDS = 8;
const ROUND_PAUSE_MS = 900;
/** Difficulty ramp: each mole stays "up" a little less time on later rounds — 1800ms on
 * round 1, shrinking by 90ms/round down to a 1050ms floor, so the game visibly speeds up
 * without ever becoming unplayable. */
const BASE_VISIBLE_MS = 1800;
const VISIBLE_MS_STEP = 90;
const MIN_VISIBLE_MS = 1050;
/** How long into the round the last mole is allowed to pop up — leaves room for its full
 * visible duration before the round's hard timeout. */
const MAX_POP_DELAY_MS = 500;

interface Mole {
  cardId: string;
  label: string;
  isCorrect: boolean;
  hole: number;
  popAt: number; // ms since round start
  popOutAt: number; // ms since round start
  /** `null` until clicked (correct or wrong); sealed moles stop accepting clicks and
   * play their squish-away animation. */
  resolvedAt: number | null;
  resolvedCorrect: boolean | null;
}

type Phase = 'loading' | 'unavailable' | 'error' | 'playing' | 'gameover';

/**
 * Whack-a-Mole vocab game (2026-10 "Vocab Studio" lineup, replacing the old space
 * shooter): React + Canvas, no external game-engine library (same constraint the
 * retired games documented). Each round shows a target MEANING; three "moles" (one
 * correct term, two decoys from the same set) pop up at staggered random times across a
 * 6-hole grid and stay up only briefly before ducking back down — tap/click the correct
 * one before it retreats. A wrong tap or a full miss (nothing tapped before every mole
 * has retreated) costs a life; either way the round advances. Same
 * `flashcardApi.completeGame('whackAMole', ...)` round-completion contract as every
 * other vocab exercise — only the play mechanic differs.
 *
 * Deliberately NOT lane-based (the two retired games were secretly the same "pick a
 * lane" mechanic under different skins) — this is pure timing/reflex: a mole is either
 * tappable right now or it isn't, regardless of its horizontal position.
 */
function StudentWhackAMoleGamePage() {
  const { t } = useTranslation();
  const strings = {
    loadFailed: t('studentWhackAMoleGame.loadFailed'),
    correctMessage: t('studentWhackAMoleGame.correctMessage'),
    wrongMessage: (label: string) => t('studentWhackAMoleGame.wrongMessage', { label }),
    missedMessage: (label: string) => t('studentWhackAMoleGame.missedMessage', { label }),
    livesNone: t('studentWhackAMoleGame.livesNone'),
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
  const molesRef = useRef<Mole[]>([]);
  const correctCardIdRef = useRef<string | null>(null);
  const livesRef = useRef(STARTING_LIVES);
  const roundLockRef = useRef(false);
  const roundStartTsRef = useRef<number>(0);
  const resultsRef = useRef<Array<{ cardId: string; correct: boolean }>>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('loading');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function visibleMsForRound(round: number): number {
    return Math.max(MIN_VISIBLE_MS, BASE_VISIBLE_MS - round * VISIBLE_MS_STEP);
  }

  function setupRound(index: number) {
    const target = roundWordsRef.current[index];
    const decoys = pickDecoys(wordsRef.current, target, 2);
    const words = shuffle([target, ...decoys]);
    const holes = shuffle([0, 1, 2, 3, 4, 5]).slice(0, words.length);
    const visibleMs = visibleMsForRound(index);
    molesRef.current = words.map((w, i) => {
      const popAt = Math.round((i / words.length) * MAX_POP_DELAY_MS + Math.random() * 200);
      return {
        cardId: w.cardId,
        label: w.term,
        isCorrect: w.cardId === target.cardId,
        hole: holes[i],
        popAt,
        popOutAt: popAt + visibleMs,
        resolvedAt: null,
        resolvedCorrect: null,
      };
    });
    correctCardIdRef.current = target.cardId;
    roundLockRef.current = false;
    roundStartTsRef.current = performance.now();
    setPromptMeaning(target.meaning);
    setRoundMessage(null);
  }

  function finishGame() {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    if (!setId) return;
    setSaveStatus('saving');
    flashcardApi
      .completeGame(setId, 'whackAMole', { results: resultsRef.current })
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

  function handleMoleHit(mole: Mole, nowMs: number) {
    if (phaseRef.current !== 'playing' || roundLockRef.current) return;
    if (mole.resolvedAt !== null) return; // already popped/retreated
    if (nowMs < mole.popAt || nowMs > mole.popOutAt) return; // not currently up
    mole.resolvedAt = nowMs;
    mole.resolvedCorrect = mole.isCorrect;
    if (mole.isCorrect) {
      resolveRound(true);
    } else {
      const correctLabel = molesRef.current.find((m) => m.isCorrect)?.label ?? '';
      resolveRound(false, 'wrong', correctLabel);
    }
  }

  function handleCanvasClick(event: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || phaseRef.current !== 'playing' || roundLockRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const nowMs = performance.now() - roundStartTsRef.current;
    for (const mole of molesRef.current) {
      const hx = HOLE_X[mole.hole % HOLE_COLS];
      const hy = HOLE_Y[Math.floor(mole.hole / HOLE_COLS)];
      const dx = x - hx;
      const dy = y - hy;
      if (dx * dx + dy * dy <= HOLE_RADIUS * HOLE_RADIUS) {
        handleMoleHit(mole, nowMs);
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

  // Keyboard alternative: number keys 1-6 map to the 6 holes (left-to-right, top-to-bottom).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > HOLE_COLS * HOLE_ROWS) return;
      if (phaseRef.current !== 'playing' || roundLockRef.current) return;
      const hole = n - 1;
      const nowMs = performance.now() - roundStartTsRef.current;
      const mole = molesRef.current.find((m) => m.hole === hole);
      if (mole) handleMoleHit(mole, nowMs);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render loop: checks for a full-miss timeout and redraws every frame.
  useEffect(() => {
    function tick(ts: number) {
      lastTsRef.current = ts;

      if (phaseRef.current === 'playing' && !roundLockRef.current) {
        const nowMs = performance.now() - roundStartTsRef.current;
        const allRetreated = molesRef.current.every((m) => m.resolvedAt !== null || nowMs > m.popOutAt);
        if (allRetreated) {
          const correctLabel = molesRef.current.find((m) => m.isCorrect)?.label ?? '';
          resolveRound(false, 'missed', correctLabel);
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    function draw() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const nowMs = performance.now() - roundStartTsRef.current;

      // Grassy field background.
      const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      sky.addColorStop(0, '#dff3e3');
      sky.addColorStop(1, '#bfe6c8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (let hole = 0; hole < HOLE_COLS * HOLE_ROWS; hole++) {
        const hx = HOLE_X[hole % HOLE_COLS];
        const hy = HOLE_Y[Math.floor(hole / HOLE_COLS)];

        // Dirt mound + hole.
        ctx.fillStyle = '#8a6239';
        ctx.beginPath();
        ctx.ellipse(hx, hy + 18, HOLE_RADIUS * 0.95, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2e2013';
        ctx.beginPath();
        ctx.ellipse(hx, hy + 14, HOLE_RADIUS * 0.72, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        const mole = molesRef.current.find((m) => m.hole === hole);
        if (!mole) continue;

        // Pop progress: 0 (hidden, below hole) -> 1 (fully up) -> back to 0 (retreated).
        let progress = 0;
        if (mole.resolvedAt !== null) {
          const sinceResolve = nowMs - mole.resolvedAt;
          progress = Math.max(0, 1 - sinceResolve / 220);
        } else if (nowMs >= mole.popAt && nowMs <= mole.popOutAt) {
          const span = mole.popOutAt - mole.popAt;
          const t2 = (nowMs - mole.popAt) / span;
          // Quick pop up, hold, quick duck down.
          progress = t2 < 0.15 ? t2 / 0.15 : t2 > 0.85 ? (1 - t2) / 0.15 : 1;
        }
        if (progress <= 0.01) continue;

        const bodyColor = mole.resolvedAt !== null ? (mole.resolvedCorrect ? '#38a169' : '#e3342f') : '#8b6a4f';
        const riseY = hy + 14 - progress * 46;
        ctx.save();
        ctx.beginPath();
        ctx.rect(hx - HOLE_RADIUS, hy - 70, HOLE_RADIUS * 2, 90);
        ctx.clip();
        // Mole body.
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(hx, riseY, 34, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        // Ears.
        ctx.beginPath();
        ctx.ellipse(hx - 20, riseY - 22, 9, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(hx + 20, riseY - 22, 9, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        // Label chip on the mole's chest.
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        const chipW = Math.min(100, 18 + mole.label.length * 7);
        ctx.beginPath();
        const r = 8;
        const cx = hx - chipW / 2;
        const cy = riseY - 10;
        ctx.moveTo(cx + r, cy);
        ctx.arcTo(cx + chipW, cy, cx + chipW, cy + 20, r);
        ctx.arcTo(cx + chipW, cy + 20, cx, cy + 20, r);
        ctx.arcTo(cx, cy + 20, cx, cy, r);
        ctx.arcTo(cx, cy, cx + chipW, cy, r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1a1030';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(mole.label, hx, riseY + 4, chipW - 8);
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
          {t('studentWhackAMoleGame.backToSet')}
        </Link>
        <h1 className="vocab-display text-lg font-bold text-primary-800">🐹 {t('studentWhackAMoleGame.title')}</h1>
      </div>

      {phase === 'loading' && <p className="text-center text-base-black/60">{t('common.loading')}</p>}

      {phase === 'error' && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {phase === 'unavailable' && (
        <p className="text-sm text-base-black/60">{t('studentWhackAMoleGame.unavailable')}</p>
      )}

      {(phase === 'playing' || phase === 'gameover') && (
        <>
          <div className="flex items-center justify-between rounded-2xl border-2 border-primary-100 bg-base-white px-4 py-2.5 text-sm font-bold text-base-black">
            <span>
              {t('studentWhackAMoleGame.roundLabel', {
                current: Math.min(roundNumber, totalRounds),
                total: totalRounds,
              })}
            </span>
            <span className="text-primary-700">{t('studentWhackAMoleGame.scoreLabel', { score })}</span>
            <span>
              {t('studentWhackAMoleGame.livesLabel', {
                hearts: '❤️'.repeat(Math.max(lives, 0)) || strings.livesNone,
              })}
            </span>
          </div>

          <p className="text-center text-base font-semibold text-base-black">
            {t('studentWhackAMoleGame.promptLabel')} <span className="vocab-display text-primary-700">{promptMeaning}</span>
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
              aria-label={t('studentWhackAMoleGame.canvasLabel')}
            />
          </div>

          {roundMessage && (
            <p role="status" className="text-center text-sm font-bold text-base-black/80">
              {roundMessage}
            </p>
          )}

          <p className="text-center text-xs text-base-black/50">{t('studentWhackAMoleGame.keyboardHint')}</p>

          {phase === 'gameover' && (
            <div className="vocab-anim-pop relative overflow-hidden rounded-3xl border-2 border-primary-200 bg-base-white p-6 text-center shadow-[0_8px_0_0_rgb(var(--color-primary-100))]">
              {lives > 0 && <VocabConfetti />}
              <span className="text-4xl">{lives > 0 ? '🏆' : '🐹'}</span>
              <h2 className="vocab-display mt-1 text-lg font-bold text-primary-800">
                {lives > 0
                  ? t('studentWhackAMoleGame.roundCompleteHeading')
                  : t('studentWhackAMoleGame.gameOverHeading')}
              </h2>
              <p className="mt-1 text-base-black/70">
                {t('studentWhackAMoleGame.finalScoreLine', { score, answered: answeredCount })}
              </p>
              <p className="text-xs text-base-black/50">
                {saveStatus === 'saving' && t('studentWhackAMoleGame.saving')}
                {saveStatus === 'saved' && t('studentWhackAMoleGame.saved')}
                {saveStatus === 'failed' && t('studentWhackAMoleGame.saveFailed')}
              </p>
              <div className="mt-3 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="vocab-btn-primary bg-primary-500 px-5 py-2.5 text-sm text-base-white"
                >
                  {t('studentWhackAMoleGame.playAgain')}
                </button>
                <Link
                  to={`/student/flashcard-sets/${setId}`}
                  className="vocab-btn-secondary border-2 border-primary-200 bg-base-white px-5 py-2.5 text-sm text-primary-700"
                >
                  {t('studentWhackAMoleGame.backToSetButton')}
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentWhackAMoleGamePage;
