import type { Config } from 'tailwindcss';

const token = (name: string): string => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        primary: token('text-primary'),
        secondary: token('text-secondary'),
        accent: token('accent'),
        'accent-tint': 'rgb(var(--color-accent) / 0.15)',
        'on-accent': token('on-accent'),
        success: token('success'),
        danger: token('danger'),
        warning: token('warning'),
        'pr-gold': token('pr-gold'),
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
      },
      fontSize: {
        caption: ['0.75rem', '1rem'],
        'body-sm': ['0.875rem', '1.25rem'],
        body: ['1rem', '1.5rem'],
        'title-sm': ['1.125rem', '1.5rem'],
        title: ['1.5rem', '2rem'],
        stat: ['2rem', '2.5rem'],
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
      },
      animation: { shake: 'shake 0.4s ease-in-out' },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
  plugins: [],
} satisfies Config;
