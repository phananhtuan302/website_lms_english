import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameWordDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
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
  cardId: string;
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

/** Picks `n` decoy words distinct from `target`, padding with repeats if the set is too
 * small to have `n` distinct alternatives (a small demo set of 2-3 words should still
 * be playable, just with an occasional repeated decoy). */
function pickDecoys(words: GameWordDTO[], target: GameWordDTO, n: number): GameWordDTO[] {
  const pool = shuffle(words.filter((w) => w.cardId !== target.cardId));
  const result: GameWordDTO[] = [];
  for (let i = 0; i < n; i++) {
    result.push(pool.length > 0 ? pool[i % pool.length] : target);
  }
  return result;
}

/**
 * Space-shooter vocab game (T-034): React + Canvas, no external game-engine library
 * (per TECH_STACK.md). Each round shows a target word; three lanes hold falling
 * "ships" labeled with candidate meanings (one correct, two decoys drawn from the same
 * set). The player switches lanes and fires; a correct hit scores a point and advances
 * to the next word, a wrong hit costs a life (visible penalty) and still advances so
 * one mistake never stalls the round. The game ends after `MAX_ROUNDS` words or when
 * lives hit 0, then reports one correct/incorrect verdict per word played via
 * `flashcardApi.completeGame` — the same progress-recording mechanism every other
 * vocabulary exercise in this codebase uses (`applyBatchProgress` server-side).
 *
 * Documented simplification ("a few minutes of dev time worth of gameplay depth is
 * fine — this is a study aid, not a AAA game", PROJECT_PLAN T-034): movement/aiming is
 * 3 discrete lanes rather than free pixel positioning, and a shot's correctness is
 * decided the instant it's fired (by which lane it was fired from) rather than by
 * pixel-perfect bullet/target collision — the bullet's on-screen flight to the target
 * row is still a real, continuously-animated canvas element, and targets fall and loop
 * continuously in the background, so the game is genuinely interactive and never just
 * a static mockup, without needing physics-grade collision tuning.
 */
function StudentSpaceShooterGamePage() {
  const { setId } = useParams<{ setId: string }>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(0);
  const [promptTerm, setPromptTerm] = useState('');
  const [roundMessage, setRoundMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'failed' | null>(null);
  // Mirrors `resultsRef.current.length` for rendering — reading a ref's `.current`
  // during render isn't safe (React may not know to re-render when it changes), so the
  // count is tracked as real state instead, updated alongside every push into the ref.
  const [answeredCount, setAnsweredCount] = useState(0);

  // Mutable game state read/written by the render loop and input handlers — kept out of
  // React state so the 60fps loop never triggers a re-render by itself; React state
  // above is only for the HUD (updated on discrete events: fire, round change, game over).
  const wordsRef = useRef<GameWordDTO[]>([]);
  const roundWordsRef = useRef<GameWordDTO[]>([]);
  const roundIndexRef = useRef(0);
  const targetsRef = useRef<LaneTarget[]>([]);
  const correctCardIdRef = useRef<string | null>(null);
  const laneRef = useRef(1);
  const bulletRef = useRef<Bullet | null>(null);
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
    const laneWords = shuffle([target, ...decoys]);
    targetsRef.current = laneWords.map((w, lane) => ({
      cardId: w.cardId,
      label: w.meaning,
      lane,
      y: TARGET_ROW_Y,
    }));
    correctCardIdRef.current = target.cardId;
    bulletRef.current = null;
    roundLockRef.current = false;
    setPromptTerm(target.term);
    setRoundMessage(null);
  }

  function finishGame() {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    if (!setId) return;
    setSaveStatus('saving');
    flashcardApi
      .completeGame(setId, 'spaceShooter', { results: resultsRef.current })
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

  function resolveBulletHit(bullet: Bullet) {
    resultsRef.current.push({ cardId: correctCardIdRef.current!, correct: bullet.correct });
    setAnsweredCount(resultsRef.current.length);
    if (bullet.correct) {
      setScore((s) => s + 1);
      setRoundMessage('Correct! 🎯');
    } else {
      livesRef.current -= 1;
      setLives(livesRef.current);
      const correctTarget = targetsRef.current.find((t) => t.cardId === correctCardIdRef.current);
      setRoundMessage(`Not quite — the right meaning was "${correctTarget?.label ?? ''}".`);
    }
    roundLockRef.current = true;
    setTimeout(advanceOrEnd, ROUND_PAUSE_MS);
  }

  function fire() {
    if (phaseRef.current !== 'playing' || roundLockRef.current || bulletRef.current) return;
    const hit = targetsRef.current.find((t) => t.lane === laneRef.current);
    bulletRef.current = { lane: laneRef.current, y: SHIP_Y, correct: hit?.cardId === correctCardIdRef.current };
  }

  function moveLane(delta: number) {
    if (phaseRef.current !== 'playing') return;
    laneRef.current = Math.max(0, Math.min(2, laneRef.current + delta));
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
        setError(err instanceof ApiError ? err.message : 'Failed to load this game.');
        setPhase('error');
      });
  }, [setId]);

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
        for (const t of targetsRef.current) {
          t.y += TARGET_FALL_SPEED * dt;
          if (t.y > CANVAS_HEIGHT) t.y = -TARGET_HEIGHT;
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

      // Falling targets.
      for (const t of targetsRef.current) {
        ctx.fillStyle = t.cardId === correctCardIdRef.current ? '#f97362' : '#f97362';
        ctx.fillStyle = '#f8b4a3';
        ctx.fillRect(LANE_X[t.lane], t.y, LANE_WIDTH, TARGET_HEIGHT);
        ctx.fillStyle = '#1a1030';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        wrapText(ctx, t.label, LANE_X[t.lane] + LANE_WIDTH / 2, t.y + TARGET_HEIGHT / 2 + 4, LANE_WIDTH - 10);
      }

      // Ship.
      const shipCenterX = LANE_CENTER[laneRef.current];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(shipCenterX, SHIP_Y - SHIP_HEIGHT / 2);
      ctx.lineTo(shipCenterX - SHIP_WIDTH / 2, SHIP_Y + SHIP_HEIGHT / 2);
      ctx.lineTo(shipCenterX + SHIP_WIDTH / 2, SHIP_Y + SHIP_HEIGHT / 2);
      ctx.closePath();
      ctx.fill();

      // Bullet.
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

  if (!setId) return null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to={`/student/flashcard-sets/${setId}`} className="text-sm text-primary-600 hover:underline">
          ← Back to set
        </Link>
        <h1 className="text-lg font-bold text-primary-700">Space Shooter</h1>
      </div>

      {phase === 'loading' && <p className="text-center text-base-black/60">Loading...</p>}

      {phase === 'error' && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {phase === 'unavailable' && (
        <p className="text-sm text-base-black/60">
          This set needs at least 2 words to play. Add more vocabulary to this set first.
        </p>
      )}

      {(phase === 'playing' || phase === 'gameover') && (
        <>
          <div className="flex items-center justify-between text-sm font-semibold text-base-black">
            <span>
              Round {Math.min(roundNumber, totalRounds)} / {totalRounds}
            </span>
            <span>Score: {score}</span>
            <span>Lives: {'❤️'.repeat(Math.max(lives, 0)) || 'None'}</span>
          </div>

          <p className="text-center text-base font-semibold text-base-black">
            Shoot the meaning of: <span className="text-primary-700">{promptTerm}</span>
          </p>

          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="mx-auto rounded-lg border border-primary-300"
            aria-label="Space shooter game canvas"
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
                ◀ Move
              </button>
              <button
                type="button"
                onClick={fire}
                className="rounded-md bg-primary-500 px-6 py-2 text-sm font-semibold text-base-white hover:bg-primary-600"
              >
                Fire
              </button>
              <button
                type="button"
                onClick={() => moveLane(1)}
                className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
              >
                Move ▶
              </button>
            </div>
          )}
          <p className="text-center text-xs text-base-black/50">
            Keyboard: ← / → to move, Space or ↑ to fire.
          </p>

          {phase === 'gameover' && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
              <h2 className="text-lg font-bold text-primary-700">
                {lives > 0 ? 'Round complete!' : 'Game over!'}
              </h2>
              <p className="text-base-black/70">
                Score: {score} / {answeredCount} words answered.
              </p>
              <p className="text-xs text-base-black/50">
                {saveStatus === 'saving' && 'Saving your progress...'}
                {saveStatus === 'saved' && 'Progress saved.'}
                {saveStatus === 'failed' && 'Could not save progress — please try again later.'}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white hover:bg-primary-600"
                >
                  Play again
                </button>
                <Link
                  to={`/student/flashcard-sets/${setId}`}
                  className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
                >
                  Back to set
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentSpaceShooterGamePage;
