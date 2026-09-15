import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './providers/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'rgb(var(--bg-primary-rgb) / <alpha-value>)',
        'bg-surface': 'rgb(var(--bg-surface-rgb) / <alpha-value>)',
        'bg-elevated': 'rgb(var(--bg-elevated-rgb) / <alpha-value>)',
        border: 'rgb(var(--border-rgb) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        'accent-primary': 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
        'accent-glow': 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
        warning: 'rgb(var(--warning-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px var(--accent-primary), 0 0 30px var(--accent-glow)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.45', transform: 'scale(.75)' },
        },
      },
      animation: {
        marquee: 'marquee 32s linear infinite',
        'pulse-dot': 'pulseDot 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
