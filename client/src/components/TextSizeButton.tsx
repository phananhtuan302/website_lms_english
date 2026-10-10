import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  applyTextScale,
  DEFAULT_TEXT_SCALE,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  readTextScale,
  saveTextScale,
} from '../lib/textSize';

/**
 * Text size slider popover component.
 * Allows smooth continuous font scale adjustment from 80% to 140%.
 */
function TextSizeButton() {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState<number>(readTextScale);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setScale(val);
    applyTextScale(val);
    saveTextScale(val);
  }

  function handleReset() {
    setScale(DEFAULT_TEXT_SCALE);
    applyTextScale(DEFAULT_TEXT_SCALE);
    saveTextScale(DEFAULT_TEXT_SCALE);
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Tùy chỉnh cỡ chữ"
        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
          open
            ? 'border-primary-500 bg-primary-50/50 text-primary-600 ring-2 ring-primary-500/20'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-baseline gap-0.5 font-bold tracking-tighter select-none">
          <span className="text-xs text-slate-400 group-hover:text-slate-600">A</span>
          <span className="text-base text-slate-800 group-hover:text-primary-600">A</span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 origin-top-right rounded-2xl border border-slate-200 bg-white p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cỡ chữ
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-600">
                {scale}%
              </span>
              {scale !== DEFAULT_TEXT_SCALE && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] font-medium text-slate-400 hover:text-slate-600 hover:underline"
                  title="Đặt lại 100%"
                >
                  Mặc định
                </button>
              )}
            </div>
          </div>

          {/* Slider Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 select-none">A-</span>
              <input
                type="range"
                min={MIN_TEXT_SCALE}
                max={MAX_TEXT_SCALE}
                step={2}
                value={scale}
                onChange={handleChange}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-primary-600"
              />
              <span className="text-sm font-bold text-slate-600 select-none">A+</span>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
              {[85, 100, 115, 130].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setScale(preset);
                    applyTextScale(preset);
                    saveTextScale(preset);
                  }}
                  className={`rounded-lg py-1 text-xs font-medium transition-all ${
                    scale === preset
                      ? 'bg-primary-600 font-bold text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TextSizeButton;
