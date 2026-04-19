import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#000000",
        panel: "#0a0a0a",
        hairline: "#1f1f1f",
        ink: "#e6e6e6",
        mute: "#6b6b6b",
        amber: "#ff6b1a",
        mint: "#7dd3a0",
        coral: "#e5484d",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
      },
    },
  },
  plugins: [],
} satisfies Config;
