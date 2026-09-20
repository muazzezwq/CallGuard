import { ConnectKitButton } from "connectkit";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Topbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = document.querySelector(".app-scroll") as HTMLElement | null;
    const target = el ?? window;
    const handler = () => setScrolled((el ? el.scrollTop : window.scrollY) > 20);
    target.addEventListener("scroll", handler);
    return () => target.removeEventListener("scroll", handler);
  }, []);

  return (
    <motion.header
      className="sticky top-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(8,11,16,0.97)" : "rgba(8,11,16,0.7)",
        backdropFilter: "blur(20px)",
        borderBottom: scrolled ? "1px solid rgba(16,185,129,0.12)" : "1px solid rgba(255,255,255,0.05)",
        boxShadow: scrolled ? "0 4px 32px rgba(0,0,0,0.5)" : "none",
      }}
    >
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center
            text-accent font-bold text-sm">C</div>
          <div>
            <div className="text-sm font-semibold text-white">CallGuard</div>
            <div className="text-[10px] text-white/30 font-mono leading-none">on-chain SLA · arc testnet</div>
          </div>
        </div>
        <ConnectKitButton />
      </div>
    </motion.header>
  );
}
