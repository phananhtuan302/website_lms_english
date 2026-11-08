import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type FieldSize = 'sm' | 'md';

const SIZE_CLASSES: Record<FieldSize, string> = {
  md: 'px-3 py-2 text-sm',
  sm: 'px-2 py-1 text-xs',
};

const BASE =
  'w-full rounded-lg border border-slate-300 bg-base-white text-base-black font-normal transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: FieldSize;
}

function Input({ size = 'md', className, ...rest }: InputProps) {
  return <input className={cn(BASE, SIZE_CLASSES[size], className)} {...rest} />;
}

export default Input;
