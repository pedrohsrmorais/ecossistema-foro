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
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
