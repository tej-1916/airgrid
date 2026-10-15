/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        void: '#070A0F',
        editorial: {
          bg: '#F5F5F3',
          card: '#FFFFFF',
          dark: '#0B0B0D',
          darkcard: '#121215',
          softgray: '#D9DBDE',
          muted: '#737373',
          copper: '#BE6B37',
          'copper-bright': '#D47B43',
          'copper-dark': '#9A5226',
          border: '#E5E5E2',
          surface: '#ECECE8',
          visualizer: '#0D0F12',
        },
        navy: {
          950: '#0B0F17',
          900: '#111827',
          850: '#151E2E',
          800: '#1F2937',
          700: '#374151',
          600: '#4B5563',
        },
        electric: {
          cyan: '#06B6D4',
          'cyan-bright': '#22D3EE',
          blue: '#3B82F6',
          'blue-bright': '#60A5FA',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
