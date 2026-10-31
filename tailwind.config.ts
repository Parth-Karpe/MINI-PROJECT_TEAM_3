import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        campus: {
          bg: "#0B1220",
          panel: "#121B2E",
          card: "#17233A",
          border: "#26324A",
          hover: "#1E2C4A",
          accent: "#4FD1C5",
          accentHover: "#38B2AC",
          muted: "#7C8AA8",
          text: "#DCE4F0",
          success: "#34C77B",
          warning: "#E8B34A",
          danger: "#F0665A",
          theory: "#818CF8", // Indigo
          lab: "#F59E0B",    // Amber
          tutorial: "#2DD4BF", // Teal
        },
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        cardGlow: "0 0 15px -3px rgba(79, 209, 197, 0.15)",
        cardHover: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 15px -3px rgba(79, 209, 197, 0.2)",
      },
      borderRadius: {
        panel: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
