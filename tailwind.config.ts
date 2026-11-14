import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pine: { 50: "#eef5ee", 100: "#e5f0e6", 200: "#cedfce", 500: "#51816a", 600: "#2c654d", 700: "#1e543f", 800: "#184433", 900: "#14382d" },
        ink: "#253c32",
        muted: "#859187",
        canvas: "#f9faf7"
      },
      boxShadow: {
        float: "0 9px 34px rgba(16, 48, 33, 0.15), 0 2px 8px rgba(16, 48, 33, 0.05)",
        soft: "0 6px 22px rgba(30, 54, 42, 0.09)"
      },
      borderRadius: { card: "19px" }
    }
  },
  plugins: []
} satisfies Config;
