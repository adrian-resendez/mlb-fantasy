/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        white: "var(--surface-card)",
        slate: {
          50: "var(--surface-card)",
          100: "var(--surface-table-head)",
          200: "var(--surface-panel)",
          300: "var(--border-main)",
          400: "var(--text-soft)",
          500: "var(--text-soft)",
          600: "var(--text-main)",
          700: "var(--text-main)",
          800: "var(--text-strong)",
          900: "var(--text-strong)",
        },
        blue: {
          100: "var(--surface-row-hover)",
          500: "var(--accent-info)",
          600: "var(--accent-primary)",
          700: "var(--accent-primary-hover)",
        },
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
      },
    },
  },
  plugins: [],
};
