import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211f",
        field: "#eef2ed",
        brass: "#a0712b",
        signal: "#256f86"
      }
    }
  },
  plugins: []
};

export default config;
