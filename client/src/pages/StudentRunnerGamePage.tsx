import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { GameWordDTO } from '@platform/shared';
import { flashcardApi } from '../lib/flashcardApi';
import { ApiError } from '../lib/apiClient';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 300;
const LANE_Y = [70, 150, 230];
const PLAYER_X = 70;
const PLAYER_RADIUS = 14;
const GATE_WIDTH = 100;
const GATE_HEIGHT = 34;
const GATE_START_X = CANVAS_WIDTH + 40;
const GATE_SPEED = 85; // px/s — travel time from spawn to the player is ~6s, plenty to react
const GROUND_Y = 270;
const GROUND_SPEED = 90; // px/s, purely cosmetic scroll to sell "moving forward"
const STARTING_LIVES = 3;
const MAX_ROUNDS = 8;
const ROUND_PAUSE_MS = 900;

interface Gate {
  cardId: string;
  label: string;
  lane: number;
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

/** Same padding-with-repeats rationale as the space shooter's `pickDecoys`. */
function pickDecoys(words: GameWordDTO[], target: GameWordDTO, n: number): GameWordDTO[] {
  const pool = shuffle(words.filter((w) => w.cardId !== target.cardId));
  const result: GameWordDTO[] = [];
  for (let i = 0; i < n; i++) {
    result.push(pool.length > 0 ? pool[i % pool.length] : target);
  }
  return result;
}

/**
 * Mario-style runner vocab game (T-035): React + Canvas, no external game-engine
 * library (per TECH_STACK.md). Each round shows a target MEANING at the top; three
 * "gates" approach from the right, one per lane, each labeled with a candidate TERM
 * (one correct, two decoys from the same set — the mirror image of the space shooter's
 * term-prompt/meaning-targets layout, T-034, so the two games don't feel identical).
 * The player switches lanes (jump/duck) to be in the correct lane by the time the gates
 * reach them; running through the right gate scores a point and bounces onward, the
 * wrong gate costs a life (visible penalty — a red flash) but the run continues either
 * way. The game ends after `MAX_ROUNDS` words or when lives hit 0, then reports one
 * correct/incorrect verdict per word played via `flashcardApi.completeGame` — same
 * mechanism as every other vocabulary exercise (`applyBatchProgress` server-side).
 *
 * Documented simplification, same reasoning as `StudentSpaceShooterGamePage.tsx`:
 * lane-switching is 3 discrete lanes, not free vertical movement, and a round resolves
 * automatically the instant the (continuously, visibly scrolling) gates reach the
 * player rather than via pixel-perfect collision shapes — genuinely interactive and
 * timing-based, without physics-grade tuning, matching PROJECT_PLAN's explicit "a few
 * minutes of dev time worth of gameplay depth is fine" scope for this task.
 */
function StudentRunnerGamePage() {
  const { t } = useTranslation();
  // Resolved once per render into plain strings so they can be used from event
  // handlers and the render-loop closures below without calling `t()` outside the
  // component body (React hooks can only be invoked at the top of the component).
  const strings = {
    loadFailed: t('studentRunnerGame.loadFailed'),
    correctMessage: t('studentRunnerGame.correctMessage'),
    wrongMessage: (label: string) => t('studentRunnerGame.wrongMessage', { label }),
    livesNone: t('studentRunnerGame.livesNone'),
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
  // Mirrors `resultsRef.current.length` for rendering — see the same-named state in
  // `StudentSpaceShooterGamePage.tsx` for why reading the ref directly during render is
  // avoided.
  const [answeredCount, setAnsweredCount] = useState(0);

  const wordsRef = useRef<GameWordDTO[]>([]);
  const roundWordsRef = useRef<GameWordDTO[]>([]);
  const roundIndexRef = useRef(0);
  const gatesRef = useRef<Gate[]>([]);
  const gateXRef = useRef(GATE_START_X);
  const correctCardIdRef = useRef<string | null>(null);
  const laneRef = useRef(1);
  const livesRef = useRef(STARTING_LIVES);
  const roundLockRef = useRef(false);
  const flashRef = useRef<'correct' | 'wrong' | null>(null);
  const groundOffsetRef = useRef(0);
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
    gatesRef.current = laneWords.map((w, lane) => ({ cardId: w.cardId, label: w.term, lane }));
    correctCardIdRef.current = target.cardId;
    gateXRef.current = GATE_START_X;
    roundLockRef.current = false;
    flashRef.current = null;
    setPromptMeaning(target.meaning);
    setRoundMessage(null);
  }

  function finishGame() {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    if (!setId) return;
    setSaveStatus('saving');
    flashcardApi
      .completeGame(setId, 'runner', { results: resultsRef.current })
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

  function resolveArrival() {
    const hitGate = gatesRef.current.find((g) => g.lane === laneRef.current);
    const correct = hitGate?.cardId === correctCardIdRef.current;
    resultsRef.current.push({ cardId: correctCardIdRef.current!, correct });
    setAnsweredCount(resultsRef.current.length);
    if (correct) {
      setScore((s) => s + 1);
      flashRef.current = 'correct';
      setRoundMessage(strings.correctMessage);
    } else {
      livesRef.current -= 1;
      setLives(livesRef.current);
      flashRef.current = 'wrong';
      const correctGate = gatesRef.current.find((g) => g.cardId === correctCardIdRef.current);
      setRoundMessage(strings.wrongMessage(correctGate?.label ?? ''));
    }
    roundLockRef.current = true;
    setTimeout(advanceOrEnd, ROUND_PAUSE_MS);
  }

  function moveLane(delta: number) {
    if (phaseRef.current !== 'playing') return;
    laneRef.current = Math.max(0, Math.min(2, laneRef.current + delta));
  }

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
    // `strings` is derived from `t`, stable in practice (i18next only re-creates it on
    // a real language change, which never happens mid-session); re-running this fetch
    // on every `strings` identity change would be pure noise, not a real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveLane(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveLane(1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function tick(ts: number) {
      const dt = lastTsRef.current == null ? 0 : (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      if (phaseRef.current === 'playing') {
        groundOffsetRef.current = (groundOffsetRef.current + GROUND_SPEED * dt) % 40;
        if (!roundLockRef.current) {
          gateXRef.current -= GATE_SPEED * dt;
          if (gateXRef.current <= PLAYER_X) {
            resolveArrival();
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

      ctx.fillStyle = '#cdeeff';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Scrolling ground.
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
      ctx.stroke();
      ctx.strokeStyle = '#a97c50';
      ctx.lineWidth = 3;
      for (let x = -40 + groundOffsetRef.current; x < CANVAS_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 6);
        ctx.lineTo(x + 20, GROUND_Y + 6);
        ctx.stroke();
      }

      // Gates.
      for (const g of gatesRef.current) {
        ctx.fillStyle = g.cardId === correctCardIdRef.current ? '#c7f0c2' : '#ffd9cf';
        ctx.fillRect(gateXRef.current, LANE_Y[g.lane] - GATE_HEIGHT / 2, GATE_WIDTH, GATE_HEIGHT);
        ctx.fillStyle = '#1a1030';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.label, gateXRef.current + GATE_WIDTH / 2, LANE_Y[g.lane] + 4);
      }

      // Player.
      ctx.fillStyle = flashRef.current === 'wrong' ? '#e3342f' : flashRef.current === 'correct' ? '#38a169' : '#f2542d';
      ctx.beginPath();
      ctx.arc(PLAYER_X, LANE_Y[laneRef.current], PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
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
          {t('studentRunnerGame.backToSet')}
        </Link>
        <h1 className="text-lg font-bold text-primary-700">{t('studentRunnerGame.title')}</h1>
      </div>

      {phase === 'loading' && <p className="text-center text-base-black/60">{t('common.loading')}</p>}

      {phase === 'error' && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {phase === 'unavailable' && (
        <p className="text-sm text-base-black/60">{t('studentRunnerGame.unavailable')}</p>
      )}

      {(phase === 'playing' || phase === 'gameover') && (
        <>
          <div className="flex items-center justify-between text-sm font-semibold text-base-black">
            <span>
              {t('studentRunnerGame.roundLabel', {
                current: Math.min(roundNumber, totalRounds),
                total: totalRounds,
              })}
            </span>
            <span>{t('studentRunnerGame.scoreLabel', { score })}</span>
            <span>
              {t('studentRunnerGame.livesLabel', {
                hearts: '❤️'.repeat(Math.max(lives, 0)) || strings.livesNone,
              })}
            </span>
          </div>

          <p className="text-center text-base font-semibold text-base-black">
            {t('studentRunnerGame.promptLabel')} <span className="text-primary-700">{promptMeaning}</span>
          </p>

          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="mx-auto rounded-lg border border-primary-300"
            aria-label={t('studentRunnerGame.canvasLabel')}
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
                {t('studentRunnerGame.jumpUp')}
              </button>
              <button
                type="button"
                onClick={() => moveLane(1)}
                className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
              >
                {t('studentRunnerGame.duckDown')}
              </button>
            </div>
          )}
          <p className="text-center text-xs text-base-black/50">{t('studentRunnerGame.keyboardHint')}</p>

          {phase === 'gameover' && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 p-6 text-center">
              <h2 className="text-lg font-bold text-primary-700">
                {lives > 0
                  ? t('studentRunnerGame.runCompleteHeading')
                  : t('studentRunnerGame.gameOverHeading')}
              </h2>
              <p className="text-base-black/70">
                {t('studentRunnerGame.finalScoreLine', { score, answered: answeredCount })}
              </p>
              <p className="text-xs text-base-black/50">
                {saveStatus === 'saving' && t('studentRunnerGame.saving')}
                {saveStatus === 'saved' && t('studentRunnerGame.saved')}
                {saveStatus === 'failed' && t('studentRunnerGame.saveFailed')}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-base-white hover:bg-primary-600"
                >
                  {t('studentRunnerGame.playAgain')}
                </button>
                <Link
                  to={`/student/flashcard-sets/${setId}`}
                  className="rounded-md border border-primary-300 bg-base-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
                >
                  {t('studentRunnerGame.backToSetButton')}
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default StudentRunnerGamePage;
