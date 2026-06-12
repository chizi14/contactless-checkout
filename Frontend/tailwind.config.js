/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#f8f9fa',
        secondary: '#ffffff',
        surface: '#f1f3f5',
        border: '#e9ecef',
        text: {
          primary: '#212529',
          secondary: '#6c757d',
          muted: '#adb5bd',
        },
        accent: {
          DEFAULT: '#2d6a4f',
          light: '#52b788',
          lighter: '#d8f3dc',
        },
        danger: {
          DEFAULT: '#c0392b',
          light: '#fdecea',
        },
        success: {
          DEFAULT: '#2d6a4f',
          light: '#d8f3dc',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        elevated: '0 4px 12px rgba(0,0,0,0.08)',
      }
    },
  },
  plugins: [],
}