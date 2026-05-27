import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        neutral: {
          0: "#FFFFFF",
          25: "#FCFCFA",
          50: "#F7F7F4",
          75: "#F2F2EE",
          100: "#EDEDE8",
          150: "#E5E5DF",
          200: "#DCDCD5",
          300: "#BDBDB4",
          400: "#96968B",
          500: "#6E6E62",
          600: "#565649",
          700: "#3F3F34",
          800: "#2A2A22",
          900: "#17170F",
        },
        accent: {
          50: "#FBF3E4",
          100: "#F5E1B9",
          200: "#EDCA85",
          300: "#E0AE52",
          400: "#CC922C",
          500: "#B07A1A",
          600: "#8E6213",
          700: "#6D4B0E",
          800: "#4E3509",
        },
        success: {
          50: "#EEF4E6",
          100: "#D9E5C4",
          500: "#5C7A2E",
          700: "#3E5220",
        },
        warning: {
          50: "#FAEEDB",
          100: "#F0D9A8",
          500: "#B87914",
          800: "#6B4408",
        },
        danger: {
          50: "#F9E6E1",
          100: "#EEC5BB",
          500: "#B03A1E",
          600: "#8E2D16",
          700: "#6D2210",
        },
        info: {
          50: "#E4ECF2",
          100: "#C2D3E0",
          500: "#3A6B8E",
          700: "#264558",
        },
      },
      fontFamily: {
        sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        xs: ["11px", { lineHeight: "14px", letterSpacing: "-0.005em" }],
        sm: ["12px", { lineHeight: "16px", letterSpacing: "-0.005em" }],
        base: ["13px", { lineHeight: "18px", letterSpacing: "-0.01em" }],
        md: ["14px", { lineHeight: "20px", letterSpacing: "-0.01em" }],
        lg: ["16px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        xl: ["20px", { lineHeight: "26px", letterSpacing: "-0.02em" }],
        "2xl": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
        "3xl": ["36px", { lineHeight: "42px", letterSpacing: "-0.02em" }],
      },
      spacing: {
        "0.5": "2px",
        "1.5": "6px",
        "2.5": "10px",
      },
      borderRadius: {
        none: "0",
        xs: "2px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        full: "9999px",
      },
      boxShadow: {
        popover: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
        modal: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.06)",
        sticky: "0 1px 2px rgba(0,0,0,0.04)",
        "footer-up": "0 -1px 2px rgba(0,0,0,0.04)",
      },
      transitionDuration: {
        "80": "80ms",
        "120": "120ms",
        "150": "150ms",
        "200": "200ms",
      },
      zIndex: {
        sticky: "10",
        pinned: "20",
        dropdown: "100",
        overlay: "200",
        "modal-backdrop": "900",
        modal: "1000",
        "command-palette": "1100",
        toast: "1200",
        tooltip: "1300",
      },
      keyframes: {
        "slide-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        "slide-indeterminate": "slide-indeterminate 1200ms ease-in-out infinite",
      },
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
    },
  },
  plugins: [],
};

export default config;
