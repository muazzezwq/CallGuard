/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "#080b10",
          1: "#0d1117",
          2: "#111820",
          3: "#161e28",
        },
        accent: {
          DEFAULT: "#10b981",
          dim: "#059669",
          bg: "rgba(16,185,129,0.08)",
        },
        danger: { DEFAULT: "#ef4444", bg: "rgba(239,68,68,0.08)" },
        warn: { DEFAULT: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
        info: { DEFAULT: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
      },
      fontFamily: {
        sans: ["Spline Sans", "Inter", "system-ui", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease",
        "slide-up": "slideUp 0.4s cubic-bezier(0.22,1,0.36,1)",
        "pulse-glow": "pulseGlow 2s infinite",
        "counter": "counter 0.6s ease",
        "border-beam": "borderBeam 3s linear infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        slideUp: { from: { opacity: 0, transform: "translateY(24px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        pulseGlow: { "0%,100%": { boxShadow: "0 0 4px #10b981" }, "50%": { boxShadow: "0 0 16px #10b981, 0 0 32px rgba(16,185,129,0.3)" } },
        borderBeam: { from: { backgroundPosition: "0% 0%" }, to: { backgroundPosition: "200% 0%" } },
      },
      boxShadow: {
        glow: "0 0 20px rgba(16,185,129,0.25)",
        "glow-sm": "0 0 10px rgba(16,185,129,0.15)",
        card: "0 4px 24px rgba(0,0,0,0.4)",
        "card-hover": "0 8px 40px rgba(0,0,0,0.5)",
      },
      backdropBlur: { xs: "4px" },
    },
  },
  plugins: [],
};
