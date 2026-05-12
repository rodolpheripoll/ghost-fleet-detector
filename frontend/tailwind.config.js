/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app:     '#f6f8fb',
        surface: '#ffffff',
        alt:     '#eef2f7',
        border:  '#e5ebf2',
        navy:    '#1e3a5f',
        navy2:   '#264a78',
        navy3:   '#3a6aa8',
        navbar:  '#0b1530',
        txt:     '#0b1220',
        heading: '#1e3a5f',
        sec:     '#3c5273',
        muted:   '#64748b',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        card: '14px',
        btn:  '8px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -16px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}
