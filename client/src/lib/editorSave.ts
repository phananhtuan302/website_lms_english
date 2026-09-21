import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { friendlyEditorError, rawErrorText } from './editorErrors';
import { SerialSaver, type SaveUnitState, type SaverReport } from './serialSaver';

/**
 * Glue between the individual savers of the test editor (one per question, per section, one for
 * the title block — see `serialSaver.ts`) and the single status line at the top of the page
 * ("Đang lưu…" / "Đã lưu lúc 14:05" / "Chưa lưu được — bấm để thử lại").
 *
 * `useEditorSaveStore` lives in the page: it collects every saver's report, exposes the combined
 * status and can flush all savers (leaving the page, opening the preview). `useSerialSaver` is
 * what each editing component uses to save its own piece.
 */

/** What the page's flush / warn-before-leaving logic needs from each saver. */
export interface SaverHandle {
  flush(): Promise<void>;
  hasUnsaved(): boolean;
  flushOnUnload(): void;
}

interface UnitEntry {
  state: SaveUnitState;
  message?: string;
  detail?: string;
  retry?: () => void;
}

export interface EditorSaveTracker {
  report(unitId: string, report: SaverReport, retry?: () => void): void;
  register(handle: SaverHandle): () => void;
  /** Sends every pending edit now and resolves when nothing is in flight (before a preview / assign). */
  flushAll(): Promise<void>;
}

export type EditorSavePhase = 'idle' | 'saving' | 'saved' | 'failed' | 'held';

export interface EditorSaveStatus {
  phase: EditorSavePhase;
  lastSavedAt: Date | null;
  /** Short plain-language reason for `failed` / `held`. */
  message?: string;
  /** Original technical text (tooltip only). */
  detail?: string;
  retry: () => void;
}

const NOOP_TRACKER: EditorSaveTracker = {
  report: () => undefined,
  register: () => () => undefined,
  flushAll: () => Promise.resolve(),
};

export const EditorSaveContext = createContext<EditorSaveTracker>(NOOP_TRACKER);

/** Page-level store: combines the reports of all savers below it. */
export function useEditorSaveStore() {
  const [units, setUnits] = useState<Record<string, UnitEntry>>({});
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const handles = useRef(new Set<SaverHandle>());

  const flushAll = useCallback(async () => {
    await Promise.all([...handles.current].map((handle) => handle.flush()));
  }, []);

  const tracker = useMemo<EditorSaveTracker>(
    () => ({
      flushAll,
      report(unitId, report, retry) {
        setUnits((prev) => {
          if (report.state === 'idle') {
            if (!(unitId in prev)) return prev;
            const next = { ...prev };
            delete next[unitId];
            return next;
          }
          const current = prev[unitId];
          if (current && current.state === report.state && current.message === report.message) return prev;
          return {
            ...prev,
            [unitId]: { state: report.state, message: report.message, detail: report.detail, retry },
          };
        });
        if (report.justSaved) setLastSavedAt(new Date());
      },
      register(handle) {
        handles.current.add(handle);
        return () => {
          handles.current.delete(handle);
        };
      },
    }),
    [flushAll],
  );

  const hasUnsaved = useCallback(() => [...handles.current].some((handle) => handle.hasUnsaved()), []);
  const flushAllOnUnload = useCallback(() => {
    handles.current.forEach((handle) => handle.flushOnUnload());
  }, []);

  const status = useMemo<EditorSaveStatus>(() => {
    const entries = Object.values(units);
    const failed = entries.find((entry) => entry.state === 'failed');
    const retryFailed = () => {
      for (const entry of entries) if (entry.state === 'failed') entry.retry?.();
    };
    if (entries.some((entry) => entry.state === 'saving' || entry.state === 'pending')) {
      return { phase: 'saving', lastSavedAt, retry: retryFailed };
    }
    if (failed) {
      return { phase: 'failed', lastSavedAt, message: failed.message, detail: failed.detail, retry: retryFailed };
    }
    const held = entries.find((entry) => entry.state === 'held');
    if (held) return { phase: 'held', lastSavedAt, message: held.message, retry: retryFailed };
    return { phase: lastSavedAt ? 'saved' : 'idle', lastSavedAt, retry: retryFailed };
  }, [units, lastSavedAt]);

  return { tracker, status, flushAll, hasUnsaved, flushAllOnUnload };
}

interface SerialSaverHookOptions<T> {
  /** Pause after the last change before saving. Default 700 ms; numeric fields use less. */
  debounceMs?: number;
  /** Best-effort write while the page is closing (a keepalive request). */
  saveOnUnload?: (value: T) => void;
}

/**
 * One serialized autosaver for one piece of the test. `saver.schedule(fullState)` on every
 * change, `saver.flush()` on blur. The pending state is sent when the component unmounts (e.g. an
 * in-app link click), and failures/holds show up in the page's status line.
 */
export function useSerialSaver<T>(
  unitId: string,
  save: (value: T) => Promise<void>,
  options: SerialSaverHookOptions<T> = {},
): SerialSaver<T> {
  const tracker = useContext(EditorSaveContext);
  const { t } = useTranslation();
  const debounceMs = options.debounceMs ?? 700;
  const saveOnUnload = options.saveOnUnload;

  const [saver] = useState(
    () =>
      new SerialSaver<T>({
        save,
        saveOnUnload,
        debounceMs,
        onReport: () => undefined,
        describeError: () => ({ message: '', detail: '' }),
      }),
  );

  // Always use the latest closures (state captured by `save`, current language, current page tracker).
  useEffect(() => {
    saver.updateOptions({
      save,
      saveOnUnload,
      debounceMs,
      onReport: (report) => tracker.report(unitId, report, () => saver.retry()),
      describeError: (err) => {
        const detail = rawErrorText(err);
        return { message: friendlyEditorError(err, t), detail };
      },
    });
  });

  useEffect(() => tracker.register(saver), [tracker, saver]);

  // Leaving (in-app navigation, question removed from the list): send whatever is still pending.
  useEffect(
    () => () => {
      void saver.flush();
    },
    [saver],
  );

  return saver;
}
