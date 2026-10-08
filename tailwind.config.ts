import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // === Semantic tokens (HSL-wrapped for tailwind compatibility) ===
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
          muted: "var(--card-muted)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          hover: "var(--primary-hover)",
          subtle: "var(--primary-subtle)",
          "subtle-foreground": "var(--primary-subtle-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
          subtle: "var(--destructive-subtle)",
          "subtle-foreground": "var(--destructive-subtle-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
          subtle: "var(--success-subtle)",
          "subtle-foreground": "var(--success-subtle-foreground)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          foreground: "var(--warning-foreground)",
          subtle: "var(--warning-subtle)",
          "subtle-foreground": "var(--warning-subtle-foreground)",
        },
        info: {
          DEFAULT: "var(--info)",
          foreground: "var(--info-foreground)",
          subtle: "var(--info-subtle)",
          "subtle-foreground": "var(--info-subtle-foreground)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        input: {
          DEFAULT: "var(--input)",
          hover: "var(--input-hover)",
        },
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
          "6": "var(--chart-6)",
        },
        // === Brand scale (emerald) — for explicit color usage ===
        brand: {
          50: "var(--color-brand-50)",
          100: "var(--color-brand-100)",
          200: "var(--color-brand-200)",
          300: "var(--color-brand-300)",
          400: "var(--color-brand-400)",
          500: "var(--color-brand-500)",
          600: "var(--color-brand-600)",
          700: "var(--color-brand-700)",
          800: "var(--color-brand-800)",
          900: "var(--color-brand-900)",
          950: "var(--color-brand-950)",
        },
        // === Accent scale (amber) — for premium highlights ===
        accent2: {
          50: "var(--color-accent-50)",
          100: "var(--color-accent-100)",
          200: "var(--color-accent-200)",
          300: "var(--color-accent-300)",
          400: "var(--color-accent-400)",
          500: "var(--color-accent-500)",
          600: "var(--color-accent-600)",
        },
        // === Sidebar ===
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        glow: "var(--shadow-glow)",
      },
      transitionTimingFunction: {
        spring: "var(--ease-spring)",
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
      keyframes: {
        "animate-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "in-up": "animate-in-up var(--duration-base) var(--ease-out) both",
        "scale-in": "scale-in var(--duration-base) var(--ease-spring) both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;
