/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Azul-marinho institucional (tom "jurídico/corporativo") — substitui o
        // indigo vibrante anterior, que lia mais como app de consumidor do que
        // como plataforma para escritórios de advocacia.
        brand: {
          50:  '#f0f4f8',
          100: '#d9e2ec',
          200: '#bccbdc',
          300: '#9fb3c8',
          400: '#8299b1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          950: '#0a1929',
        },
        // Acento discreto (dourado/bronze) — uso pontual: item ativo do menu,
        // selos/badges de destaque. Nunca como cor dominante da UI.
        accent: {
          50:  '#fbf6ec',
          100: '#f5e9d1',
          200: '#e9d1a3',
          300: '#dcb975',
          400: '#cca052',
          500: '#b08d57',
          600: '#8f7143',
          700: '#6e5733',
          800: '#4d3d24',
          900: '#2d2314',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Serifada usada só no logotipo/wordmark e em títulos de destaque —
        // sinal visual clássico de solidez/tradição, sem comprometer a
        // legibilidade da UI densa (que continua em Inter).
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
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
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(176, 141, 87, 0.35)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(176, 141, 87, 0)' },
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
