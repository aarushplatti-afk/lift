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
        caption: ['12px', '16px'],
        'body-sm': ['14px', '20px'],
        body: ['16px', '24px'],
        'title-sm': ['18px', '24px'],
        title: ['24px', '32px'],
        stat: ['32px', '40px'],
      },
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
    },
  },
  plugins: [],
} satisfies Config;
