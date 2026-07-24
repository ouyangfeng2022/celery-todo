/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Anthropic / Claude brand palette
        // Primary brand color: warm coral/terracotta (#D97757 - Claude's signature)
        claude: {
          50: '#faf6f3',
          100: '#f5ebe3',
          200: '#ecd5c5',
          300: '#dfb39a',
          400: '#d4906b',
          500: '#d97757', // Primary - Claude coral
          600: '#c75d3d',
          700: '#a64a2f',
          800: '#843c27',
          900: '#6b3220',
          950: '#3a1a10',
        },
        // Neutral warm grays (Anthropic uses warm off-whites)
        sand: {
          50: '#faf9f7',
          100: '#f5f4f0',
          200: '#e8e6df',
          300: '#d6d3c8',
          400: '#b8b3a4',
          500: '#948e7e',
          600: '#736e60',
          700: '#5c584c',
          800: '#46433a',
          900: '#2f2d27',
          950: '#1a1916',
        },
        // Accent for links and highlights
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae3',
          300: '#b0b9ca',
          400: '#8593ac',
          500: '#667491',
          600: '#515d77',
          700: '#434c61',
          800: '#3a4151',
          900: '#343945',
          950: '#22252e',
        },
      },
      fontFamily: {
        // Anthropic 品牌规范：Poppins 标题，Lora 正文。
        serif: ['"Poppins"', '"Noto Sans SC"', 'Arial', 'sans-serif'],
        sans: [
          '"Lora"',
          '"Noto Serif SC"',
          'Georgia',
          'serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Claude uses generous, readable type sizes
        'claude-sm': ['0.9375rem', { lineHeight: '1.5' }],
        'claude-base': ['1.0625rem', { lineHeight: '1.65' }],
        'claude-lg': ['1.25rem', { lineHeight: '1.5' }],
        'claude-xl': ['1.5rem', { lineHeight: '1.4' }],
        'claude-2xl': ['1.875rem', { lineHeight: '1.3' }],
      },
      borderRadius: {
        claude: '0.5rem',
      },
      boxShadow: {
        claude: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'claude-md': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
        'claude-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.06), 0 4px 6px -4px rgba(0, 0, 0, 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
