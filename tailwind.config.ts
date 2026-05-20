import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#20332b",
        field: "#ead9ad",
        brass: "#9a6d2d",
        signal: "#4f8d62",
        paper: "#fff9ea"
      }
    }
  },
  plugins: []
};

export default config;
