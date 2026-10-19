/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde7ff',
          200: '#c3d2ff',
          300: '#9cb3ff',
          400: '#7189ff',
          500: '#4f61fb',
          600: '#3a42f0',
          700: '#2f33d6',
          800: '#282cab',
          900: '#272d88',
          950: '#181a54',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
