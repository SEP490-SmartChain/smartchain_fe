import { useRef, useEffect, useState } from 'react';
import LandingCanvas, { type LandingCanvasHandle } from '@/components/landing/LandingCanvas';
import LandingStories from '@/components/landing/LandingStories';
import LandingNav from '@/components/landing/LandingNav';
import LandingFeatures from '@/components/landing/LandingFeatures';
import LandingArchitecture from '@/components/landing/LandingArchitecture';
import LandingPricing from '@/components/landing/LandingPricing';
import LandingCTA from '@/components/landing/LandingCTA';
import LandingFooter from '@/components/landing/LandingFooter';
import CustomCursor from '@/components/landing/CustomCursor';

export default function HomePage() {
  const canvasRef = useRef<LandingCanvasHandle>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const storyWrapRef = useRef<HTMLDivElement>(null);
  const [canvasVisible, setCanvasVisible] = useState(true);

  // Mouse spotlight — subtle radial glow follows cursor
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!spotlightRef.current) return;
      const { clientX: x, clientY: y } = e;
      spotlightRef.current.style.background = `radial-gradient(600px circle at ${x}px ${y}px, rgba(0, 229, 153, 0.05), transparent 70%)`;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Pause canvas compositor layer when Stories section is fully out of view
  useEffect(() => {
    const el = storyWrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setCanvasVisible(entry.isIntersecting),
      { threshold: 0, rootMargin: '200px 0px 0px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleSelectNode = (stopIdx: number) => {
    const storyEl = document.getElementById('story-container');
    if (storyEl) {
      const totalH = storyEl.scrollHeight - window.innerHeight;
      const targetY = storyEl.offsetTop + (stopIdx / 6) * totalH + 10;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Neon custom cursor — rendered outside main flow */}
      <CustomCursor />

      <main
        className="w-full max-w-full relative"
        style={{ background: '#050B14', color: '#ffffff' }}
      >
        {/* Floating nav */}
        <LandingNav />

        {/* ── Hero: 3D + Scrollytelling ───────────────────────────────────── */}
        <section
          className="relative w-full"
          aria-label="SmartChain — Intelligent Multi-Warehouse Logistics"
        >
          {/* Fixed 3D canvas — hidden when user scrolls past story section */}
          <div
            className="fixed inset-0 w-full h-screen"
            style={{
              zIndex: 5,
              contain: 'strict',
              // visibility:hidden completely skips compositor layer — zero GPU cost
              visibility: canvasVisible ? 'visible' : 'hidden',
              pointerEvents: canvasVisible ? 'auto' : 'none',
            }}
          >
            {/* Static radial glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 55% 55% at 50% 50%, rgba(0,229,153,0.06) 0%, transparent 70%), radial-gradient(ellipse 35% 40% at 25% 75%, rgba(0,180,255,0.04) 0%, transparent 60%)',
              }}
            />

            {/* Mouse spotlight — updates in real time */}
            <div
              ref={spotlightRef}
              className="absolute inset-0 pointer-events-none transition-none"
              style={{ zIndex: 1 }}
            />

            <LandingCanvas ref={canvasRef} onSelectNode={handleSelectNode} paused={!canvasVisible} />

            {/* Bottom fade into page */}
            <div
              className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
              style={{ background: 'linear-gradient(to top, #050B14, transparent)', zIndex: 2 }}
            />
          </div>

          {/* Scroll story panels */}
          <div ref={storyWrapRef} className="relative pointer-events-none" style={{ zIndex: 10 }}>
            <LandingStories canvasRef={canvasRef} />
          </div>
        </section>

        {/* ── Lower Content Sections (Solid Dark Surface) ─────────────────── */}
        <div className="relative z-20" style={{ background: '#050B14', isolation: 'isolate' }}>
          {/* ── Features bento (Solutions) ──────────────────────────────────── */}
          <section id="features" className="relative pt-12">
            <LandingFeatures />
          </section>

          {/* ── Architecture Pipeline ────────────────────────────────────────── */}
          <LandingArchitecture />

          {/* ── Enterprise Pricing ───────────────────────────────────────────── */}
          <LandingPricing />

          {/* ── CTA ────────────────────────────────────────────────────────── */}
          <LandingCTA />

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <LandingFooter />
        </div>
      </main>
    </>
  );
}
