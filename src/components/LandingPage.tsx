import { useEffect, useRef, useState } from "react";
import Navbar from "./Navbar";
import Hero from "./Hero";
import TrustBar from "./TrustBar";
import ProblemSection from "./ProblemSection";
import HowItWorks from "./HowItWorks";
import SLABuilder from "./SLABuilder";
import TransactionSim from "./TransactionSim";
import RoleCards from "./RoleCards";
import Architecture from "./Architecture";
import DevSection from "./DevSection";
import DashboardPreview from "./DashboardPreview";
import SecuritySection from "./SecuritySection";
import FinalCTA from "./FinalCTA";
import Footer from "./Footer";

export default function LandingPage() {
  return (
    <div style={{ background: "#0a0b0e", minHeight: "100vh", fontFamily: "'Inter', 'Manrope', system-ui, sans-serif", color: "#e8eaed", overflowX: "hidden" }}>
      <Navbar />
      <Hero />
      <TrustBar />
      <ProblemSection />
      <HowItWorks />
      <SLABuilder />
      <TransactionSim />
      <RoleCards />
      <Architecture />
      <DevSection />
      <DashboardPreview />
      <SecuritySection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
