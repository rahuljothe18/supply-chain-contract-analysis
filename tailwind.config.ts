import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        slate950: "#0f172a",
        slate900: "#111827",
        card: "#1e293b",
        cardBorder: "#334155",
        accent: "#14b8a6",
        accentSoft: "#0ea5e9"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(2, 6, 23, 0.35)",
        insetSoft: "inset 0 1px 0 rgba(148, 163, 184, 0.1)"
      },
      borderRadius: {
        xl2: "1rem"
      }
    }
  },
  plugins: []
};

export default config;
