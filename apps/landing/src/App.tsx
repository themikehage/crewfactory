import Hero from "./components/Hero";
import Features from "./components/Features";
import HowItWorks from "./components/HowItWorks";
import Deployment from "./components/Deployment";
import OpenSource from "./components/OpenSource";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      <Hero />
      <Features />
      <HowItWorks />
      <Deployment />
      <OpenSource />
      <Footer />
    </div>
  );
}
