/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)', ink: 'rgb(var(--ink-rgb) / <alpha-value>)', lime: '#C8FF00',
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)', 100: 'rgb(var(--slate-100) / <alpha-value>)', 200: 'rgb(var(--slate-200) / <alpha-value>)', 300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)', 500: 'rgb(var(--slate-500) / <alpha-value>)', 600: 'rgb(var(--slate-600) / <alpha-value>)', 700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)', 900: 'rgb(var(--slate-900) / <alpha-value>)', 950: 'rgb(var(--ink-rgb) / <alpha-value>)',
        },
        // Existing components retain their tokens within FORO's palette.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)', 100: 'rgb(var(--brand-100) / <alpha-value>)', 200: 'rgb(var(--brand-200) / <alpha-value>)', 300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)', 500: 'rgb(var(--brand-500) / <alpha-value>)', 600: 'rgb(var(--brand-600) / <alpha-value>)', 700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)', 900: 'rgb(var(--brand-900) / <alpha-value>)', 950: 'rgb(var(--ink-rgb) / <alpha-value>)',
        },
        accent: {
          50: '#F7FFE0', 100: '#ECFFC2', 200: '#DEFF88', 300: '#D3FF4D',
          400: '#C8FF00', 500: '#8BAD00', 600: '#657D00', 700: '#4C5E00',
          800: '#394500', 900: '#252D00',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Bricolage', 'Inter', 'sans-serif'],
        serif: ['Bricolage', 'Inter', 'sans-serif'],
        mono: ['JetBrains', 'ui-monospace', 'monospace'],
      },
      // Cantos mais contidos em toda a aplicação (os componentes usam as
      // mesmas classes rounded-lg/rounded-xl de antes — só a escala encolheu).
      // Cantos muito arredondados em tudo lêem como "app de consumidor";
      // aqui ficam discretos, mais no registro institucional.
      borderRadius: {
        none: '0',
        sm: '0.125rem',
        DEFAULT: '0.1875rem',
        md: '0.25rem',
        lg: '0.375rem',
        xl: '0.5rem',
        '2xl': '0.625rem',
        '3xl': '0.875rem',
        full: '9999px',
      },
      // Animações discretas (transição de página, selos "em breve" etc) —
      // CSS puro via Tailwind, sem dependência nova (framer-motion seria
      // overkill pro que a UI precisa aqui).
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(200, 255, 0, 0.2)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(200, 255, 0, 0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-glow': 'pulse-glow 2.2s ease-in-out infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
