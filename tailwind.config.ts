import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)"],
        heading: ["var(--font-outfit)"],
      },
      colors: {
        background: "#ffffff",
        foreground: "#0f172a",
        slate: {
          900: "#0f172a",
          800: "#1e293b",
        },
        primary: {
          DEFAULT: "#6366f1", // Indigo
          hover: "#4f46e5",
        },
      },
    },
  },
  plugins: [],
};
export default config;
