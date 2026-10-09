import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "#020617",
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
        },
        turf: {
          500: "#16a34a",
          600: "#15803d",
          400: "#22c55e",
        },
        chalk: "#f1f5f9",
        floodlight: "#eab308",
        card: {
          yellow: "#eab308",
          red: "#ef4444",
        },
        mist: "#94a3b8",
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
