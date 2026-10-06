import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink, 32 51 43) / <alpha-value>)",
        field: "rgb(var(--color-field, 234 217 173) / <alpha-value>)",
        brass: "rgb(var(--color-brass, 154 109 45) / <alpha-value>)",
        signal: "rgb(var(--color-signal, 79 141 98) / <alpha-value>)",
        paper: "rgb(var(--color-paper, 255 249 234) / <alpha-value>)"
      }
    }
  },
  plugins: []
};

export default config;
