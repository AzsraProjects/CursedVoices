/** Same palette as HOTS REVIVAL (storm, nexus, gold, void), plus "curse": the live glow. */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        storm: { 50: "#e8f4ff", 300: "#7cc4ff", 400: "#46a8ff", 500: "#1f8fff", 600: "#0f6fd6", 700: "#0b4f9c" },
        nexus: { 300: "#c4a5ff", 400: "#a87bff", 500: "#8b5cf6", 600: "#6d3fd6", 700: "#4c2a99" },
        gold: { 300: "#ffe08a", 400: "#f5c451", 500: "#d9a531", 600: "#b5841c" },
        curse: { 200: "#b8fbf5", 300: "#7af5ec", 400: "#2ee6d6", 500: "#14c8b8", 600: "#0e9f93", 700: "#0b6f67" },
        void: { 950: "#06070f", 900: "#0b0d1a", 850: "#10132a", 800: "#151935", 700: "#1e2347", 600: "#2a3060" },
      },
      fontFamily: {
        display: ["Cinzel", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(139, 92, 246, 0.35)",
        gold: "0 0 18px rgba(245, 196, 81, 0.35)",
        curse: "0 0 28px rgba(46, 230, 214, 0.55)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        breathe: { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
      },
      animation: {
        rise: "rise .18s ease-out",
        breathe: "breathe 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
