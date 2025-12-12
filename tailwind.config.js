/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  safelist: [
    "dashboard-mobile-container",
    "dashboard-mobile-section",
    "chart-mobile",
    "pie-mobile",
  ],

  theme: {
    extend: {},
  },
  plugins: [],
};
