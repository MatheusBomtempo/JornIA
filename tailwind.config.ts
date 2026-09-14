import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Superfícies (dark-first)
        bg: "#0a0c10",
        surface: "#12151b",
        elevated: "#181c24",
        line: "#252b36",
        lineSoft: "#1d222b",
        // Texto
        ink: "#e8ecf3",
        muted: "#98a2b3",
        faint: "#6b7484",
        // Marca
        brand: {
          50: "#eef3ff",
          100: "#dde7ff",
          200: "#c0d1ff",
          300: "#95b2ff",
          400: "#6a8dff",
          500: "#4d7cff",
          600: "#3563f0",
          700: "#2a4dd0",
          800: "#2542a6",
          900: "#233c82",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        art: ["var(--font-art)", "Poppins", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6)",
        glow: "0 0 0 1px rgba(77,124,255,.35), 0 8px 30px -8px rgba(77,124,255,.35)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in .18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
