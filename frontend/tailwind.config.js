/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        navy: {
          950: '#070e1c',
          900: '#0c162c',
          850: '#101c36',
          800: '#132242',
          700: '#1e325c',
          600: '#2a4478',
        },
        surface: {
          ground: '#eef2f6',
          card: '#ffffff',
          panel: 'rgba(255, 255, 255, 0.82)',
          darkpanel: 'rgba(12, 22, 44, 0.88)',
        },
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)',
        elevated: '0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
        // Neumorphic shadows
        'neu-flat': '4px 4px 10px rgba(166, 180, 200, 0.35), -4px -4px 10px rgba(255, 255, 255, 0.9)',
        'neu-raised': '5px 5px 12px rgba(160, 175, 198, 0.38), -5px -5px 12px rgba(255, 255, 255, 0.95)',
        'neu-raised-sm': '2px 2px 6px rgba(160, 175, 198, 0.3), -2px -2px 6px rgba(255, 255, 255, 0.9)',
        'neu-inset': 'inset 2px 2px 5px rgba(160, 175, 198, 0.4), inset -2px -2px 5px rgba(255, 255, 255, 0.9)',
        'neu-inset-sm': 'inset 1px 1px 3px rgba(160, 175, 198, 0.35), inset -1px -1px 3px rgba(255, 255, 255, 0.85)',
        'neu-button': '3px 3px 8px rgba(160, 175, 198, 0.35), -3px -3px 8px rgba(255, 255, 255, 0.9)',
        'neu-button-pressed': 'inset 2px 2px 5px rgba(160, 175, 198, 0.45), inset -2px -2px 5px rgba(255, 255, 255, 0.9)',
        // Glassmorphic shadow
        'glass-sm': '0 4px 16px 0 rgba(31, 38, 135, 0.07)',
        'glass-md': '0 8px 32px 0 rgba(31, 38, 135, 0.1)',
        'glass-lg': '0 12px 40px 0 rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};
