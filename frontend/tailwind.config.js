/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // The rest of the app styles with an inline design-token system and relies on
  // default browser styling for headings, text and lists. Tailwind's Preflight
  // base reset would strip that globally, so it stays off — only the utility
  // classes already used in the automation/time/reports components are emitted.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
