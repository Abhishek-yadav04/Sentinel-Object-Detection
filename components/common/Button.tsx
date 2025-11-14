import React from 'react';

type Variant = 'solid' | 'outline' | 'ghost';
type Color = 'neutral' | 'primary' | 'danger' | 'success';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  color?: Color;
  size?: 'sm' | 'md';
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
};

const colorClasses: Record<Variant, Record<Color, string>> = {
  solid: {
    neutral: 'bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white',
    primary: 'bg-blue-700 hover:bg-blue-600 border border-blue-600 text-white',
    danger: 'bg-red-700 hover:bg-red-600 border border-red-600 text-white',
    success: 'bg-green-700 hover:bg-green-600 border border-green-600 text-white',
  },
  outline: {
    neutral: 'bg-transparent hover:bg-neutral-800/40 border border-neutral-700 text-white',
    primary: 'bg-transparent hover:bg-blue-700/30 border border-blue-600 text-blue-100',
    danger: 'bg-transparent hover:bg-red-700/30 border border-red-600 text-red-100',
    success: 'bg-transparent hover:bg-green-700/30 border border-green-600 text-green-100',
  },
  ghost: {
    neutral: 'bg-transparent hover:bg-neutral-800/40 text-white',
    primary: 'bg-transparent hover:bg-blue-700/30 text-blue-100',
    danger: 'bg-transparent hover:bg-red-700/30 text-red-100',
    success: 'bg-transparent hover:bg-green-700/30 text-green-100',
  },
};

const sizeClasses = {
  sm: 'h-8 px-2 text-xs rounded',
  md: 'h-9 px-3 text-sm rounded-lg',
};

export default function Button({
  variant = 'solid',
  color = 'neutral',
  size = 'md',
  iconLeft,
  iconRight,
  className = '',
  children,
  ...rest
}: Props) {
  const base = 'inline-flex items-center justify-center gap-1.5 select-none transition-all duration-200 active:scale-[0.98]';
  const cls = `${base} ${sizeClasses[size]} ${colorClasses[variant][color]} ${className}`;
  return (
    <button className={cls} {...rest}>
      {iconLeft && <span className="-ml-0.5">{iconLeft}</span>}
      <span>{children}</span>
      {iconRight && <span className="-mr-0.5">{iconRight}</span>}
    </button>
  );
}
