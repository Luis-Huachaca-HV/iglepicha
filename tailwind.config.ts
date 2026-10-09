import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "#0B1710", // night-match background
          900: "#122117",
          800: "#1B3324",
          700: "#234A2F",
        },
        turf: {
          500: "#2F9E44", // primary grass green
          600: "#278A3B",
          400: "#4CB85C",
        },
        chalk: "#F3F6EE", // line-marking white
        floodlight: "#FFB100", // amber accent - live / timers
        card: {
          yellow: "#F4D35E",
          red: "#E63946",
        },
        mist: "#8FA396", // secondary text on dark
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      borderRadius: {
        pill: "999px",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        ratingIn: {
          "0%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        ratingIn: "ratingIn 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
