/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f5f6f8',
          100: '#e4e7ec',
          200: '#c9cfd8',
          300: '#9ba4b2',
          400: '#6c7688',
          500: '#4b5363',
          600: '#343a47',
          700: '#242932',
          750: '#1d2129',
          800: '#171a21',
          850: '#12141a',
          900: '#0c0e13',
          950: '#07080b'
        },
        accent: {
          400: '#7c8cff',
          500: '#5d6fff',
          600: '#4455e6'
        }
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace']
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        shimmer: 'shimmer 2.4s linear infinite'
      }
    }
  },
  plugins: []
};
