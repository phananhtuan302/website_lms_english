/**
 * The heart of the test editor's autosave: ONE place decides when a piece of the test (one
 * question, one section, the title block) is written to the server, so edits can neither be lost
 * nor applied twice.
 *
 * - Every change calls `schedule(fullState)`; the save runs after a short pause in typing
 *   (debounce), or right away for a structural click (`immediate`).
 * - At most ONE request per saver is ever in flight. Changes that arrive meanwhile only replace
 *   the "pending" state (latest wins) and are sent as soon as the current request finishes — the
 *   server therefore never sees two overlapping saves of the same question (the cause of choices
 *   being created twice).
 * - `flush()` sends whatever is pending now (blur, leaving the page) and resolves when nothing is
 *   in flight any more.
 * - A failed save is remembered and can be retried; a newer state simply replaces it.
 * - A save that finds the state not ready yet (an empty choice, a half-typed number) throws
 *   `HoldSave` — that is not an error: it is reported as a gentle hint, nothing is sent.
 *
 * Plain TypeScript (no React) so it stays easy to reason about; `useSerialSaver` wraps it.
 */

export type SaveUnitState = 'idle' | 'pending' | 'saving' | 'failed' | 'held';

/** Thrown by a `save` function to say "not ready to save yet, show this hint instead". */
export class HoldSave extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HoldSave';
  }
}

export interface SaverReport {
  state: SaveUnitState;
  /** Calm, user-facing sentence for `failed` / `held`. */
  message?: string;
  /** The original error text, for a tooltip / console only. */
  detail?: string;
  /** Set on the `idle` report that follows at least one successful save. */
  justSaved?: boolean;
}

export interface SerialSaverOptions<T> {
  save: (value: T) => Promise<void>;
  /** Fire-and-forget best-effort write used while the page is being closed (keepalive fetch). */
  saveOnUnload?: (value: T) => void;
  debounceMs: number;
  onReport: (report: SaverReport) => void;
  describeError: (err: unknown) => { message: string; detail: string };
}

export class SerialSaver<T> {
  private pending: { value: T } | null = null;
  private inFlight: { value: T } | null = null;
  private failed: { value: T } | null = null;
  private heldMessage: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private cancelled = false;

  constructor(private opts: SerialSaverOptions<T>) {}

  /** Lets the owner swap in the latest closures without recreating the saver. */
  updateOptions(opts: Partial<SerialSaverOptions<T>>) {
    this.opts = { ...this.opts, ...opts };
  }

  /** Records `value` as the state to save; saves after the debounce (or now if `immediate`). */
  schedule(value: T, options: { immediate?: boolean; delayMs?: number } = {}) {
    this.cancelled = false;
    this.pending = { value };
    this.clearTimer();
    this.opts.onReport({ state: 'pending' });
    const delay = options.immediate ? 0 : (options.delayMs ?? this.opts.debounceMs);
    if (delay <= 0) {
      this.kick();
    } else {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.kick();
      }, delay);
    }
  }

  /** Sends anything pending right now; resolves once nothing is in flight. */
  async flush(): Promise<void> {
    this.clearTimer();
    if (this.pending) this.kick();
    while (this.running) await this.running;
  }

  /** Forgets everything not yet sent (used before deleting the thing this saver saves). */
  cancel() {
    this.cancelled = true;
    this.clearTimer();
    this.pending = null;
    this.failed = null;
    this.heldMessage = null;
    if (!this.running) this.opts.onReport({ state: 'idle' });
  }

  /** Re-sends the state of the last failed save. */
  retry() {
    if (this.failed) this.schedule(this.failed.value, { immediate: true });
  }

  hasUnsaved(): boolean {
    return this.pending !== null || this.inFlight !== null || this.failed !== null;
  }

  /** Best-effort last write while the page unloads. */
  flushOnUnload() {
    const target = this.pending ?? this.inFlight ?? this.failed;
    if (target && this.opts.saveOnUnload) {
      try {
        this.opts.saveOnUnload(target.value);
      } catch {
        // Nothing more can be done while the page is closing.
      }
    }
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private kick() {
    if (this.running || !this.pending) return;
    this.running = this.loop().finally(() => {
      this.running = null;
    });
  }

  private async loop(): Promise<void> {
    let savedSomething = false;
    while (this.pending && !this.cancelled) {
      const job = this.pending;
      this.pending = null;
      this.inFlight = job;
      this.opts.onReport({ state: 'saving' });
      try {
        await this.opts.save(job.value);
        savedSomething = true;
        this.failed = null;
        this.heldMessage = null;
      } catch (err) {
        this.inFlight = null;
        if (err instanceof HoldSave) {
          // Not ready — keep the hint visible until a newer state replaces it.
          this.failed = null;
          this.heldMessage = err.message;
          if (!this.pending) this.opts.onReport({ state: 'held', message: err.message });
          continue;
        }
        const { message, detail } = this.opts.describeError(err);
        this.failed = job;
        this.heldMessage = null;
        // A newer state may already be waiting: it supersedes the failed one (full state each
        // time), so try it before giving up.
        if (!this.pending) {
          this.opts.onReport({ state: 'failed', message, detail });
          return;
        }
        continue;
      }
      this.inFlight = null;
    }
    this.inFlight = null;
    if (this.cancelled) {
      this.opts.onReport({ state: 'idle' });
      return;
    }
    this.opts.onReport(
      this.heldMessage
        ? { state: 'held', message: this.heldMessage }
        : { state: 'idle', justSaved: savedSomething },
    );
  }
}
