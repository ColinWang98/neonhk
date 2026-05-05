import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211f",
        field: "#f1eee6",
        brass: "#a0712b",
        signal: "#256f86",
        paper: "#fffdf8"
      }
    }
  },
  plugins: []
};

export default config;
