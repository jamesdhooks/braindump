/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './quick-capture.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)'
        },
        fg: {
          0: 'var(--fg-0)',
          1: 'var(--fg-1)',
          2: 'var(--fg-2)',
          3: 'var(--fg-3)'
        },
        accent: {
          400: 'var(--accent-400)',
          500: 'var(--accent-500)',
          600: 'var(--accent-600)'
        },
        // Backwards-compat alias so legacy `ink-*` classes keep rendering.
        ink: {
          50: 'var(--fg-0)',
          100: 'var(--fg-0)',
          200: 'var(--fg-1)',
          300: 'var(--fg-1)',
          400: 'var(--fg-2)',
          500: 'var(--fg-3)',
          600: 'var(--surface-4)',
          700: 'var(--surface-3)',
          750: 'var(--surface-3)',
          800: 'var(--surface-2)',
          850: 'var(--surface-1)',
          900: 'var(--surface-0)',
          950: 'var(--surface-0)'
        },
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        info: 'var(--info)'
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        hairline: 'var(--hairline)'
      },
      borderRadius: {
        xs: '6px',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)'
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)'
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Fraunces"', 'Iowan Old Style', 'Georgia', 'serif']
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
