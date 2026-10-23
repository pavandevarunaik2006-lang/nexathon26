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
          950: '#060c18',
          900: '#0b1426',
          800: '#121f3a',
          700: '#1c2f54',
        },
      },
    },
  },
  plugins: [],
};
