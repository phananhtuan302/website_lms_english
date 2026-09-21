import type { TFunction } from 'i18next';
import { ApiError } from './apiClient';

/**
 * Turns whatever a save / assign request threw into a calm sentence in Vietnamese for the
 * teacher. The server's own messages are English developer text ("Choices must be a list of
 * { text, isCorrect } ..."), so they are never shown: known validation messages are mapped to a
 * plain instruction, everything else becomes a generic "try again" message. The original text is
 * only logged to the console (and can be put in a `title` attribute via `rawErrorText`).
 *
 * Every string comes from the `editorErrors` i18n block.
 */

/** Known server validation messages → i18n key (under `editorErrors`). Order matters. */
const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/^Choices must be a list/i, 'emptyChoice'],
  [/Question prompt is required/i, 'promptRequired'],
  [/fillBlank questions require/i, 'acceptedAnswerRequired'],
  [/Exactly one choice must be marked/i, 'oneCorrectRequired'],
  [/multipleChoice questions require at least 2/i, 'twoChoicesRequired'],
  [/trueFalse questions require exactly 2/i, 'trueFalseTwoChoices'],
  [/essayMaxScore must be/i, 'essayScoreInvalid'],
  [/allowedResponseSeconds must be/i, 'speakingSecondsInvalid'],
  [/timeLimitMinutes must be/i, 'timeLimitInvalid'],
  [/(Test|Section) title is required/i, 'titleRequired'],
  [/maxPlayCount must be/i, 'maxPlaysInvalid'],
  [/(Test|Section|Question|Class) not found/i, 'notFound'],
  [/no current (semester|period)|current period/i, 'noSemester'],
  [/reference a class owned|classIds/i, 'classNotYours'],
  [/openAt|closeAt|not a valid date/i, 'scheduleInvalid'],
  [/no variants|no questions yet/i, 'noQuestions'],
];

/** The English original, for a `title` attribute / console — never as visible text. */
export function rawErrorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function friendlyEditorError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    for (const [pattern, key] of KNOWN_MESSAGES) {
      if (pattern.test(err.message)) return t(`editorErrors.${key}`);
    }
    if (err.status === 401 || err.status === 403) return t('editorErrors.loggedOut');
    if (err.status >= 500) return t('editorErrors.serverBusy');
    console.warn('[editor] unmapped server message:', err.status, err.message);
    return t('editorErrors.generic');
  }
  // `fetch` itself failed (offline, server restarting): a TypeError, not an ApiError.
  if (err instanceof TypeError) return t('editorErrors.network');
  console.warn('[editor] unexpected error:', err);
  return t('editorErrors.generic');
}
