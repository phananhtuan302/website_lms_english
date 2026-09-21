import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyTextSize,
  nextTextSize,
  readTextSize,
  saveTextSize,
  type TextSize,
} from '../lib/textSize';

const LABEL_KEYS: Record<TextSize, { next: string; aria: string }> = {
  normal: { next: 'header.textSize.toLarge', aria: 'header.textSize.ariaNormal' },
  large: { next: 'header.textSize.toXLarge', aria: 'header.textSize.ariaLarge' },
  xlarge: { next: 'header.textSize.toNormal', aria: 'header.textSize.ariaXLarge' },
};

/**
 * Header button that cycles the page text size: Bình thường → Chữ to (112.5%) → Chữ rất to
 * (125%) → back to normal (see `lib/textSize.ts`). The visible label names what pressing does
 * next (so an older reader sees "Chữ to" and knows the button makes the text bigger); the
 * `aria-label` also states the current size. The saved size is already applied to the page by
 * the script in `index.html`, so this only has to read it.
 */
function TextSizeButton() {
  const { t } = useTranslation();
  const [size, setSize] = useState<TextSize>(readTextSize);
  const keys = LABEL_KEYS[size];

  function cycle() {
    const next = nextTextSize(size);
    applyTextSize(next);
    saveTextSize(next);
    setSize(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={t(keys.aria)}
      data-text-size-button={size}
      className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md border border-primary-300 bg-base-white px-3 text-sm font-medium sm:px-2.5 xl:px-3 text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      <span aria-hidden="true" className="hidden text-base font-bold leading-none xl:inline">
        A
      </span>
      {t(keys.next)}
    </button>
  );
}

export default TextSizeButton;
