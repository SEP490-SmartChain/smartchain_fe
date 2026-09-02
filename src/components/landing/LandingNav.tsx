import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const NAV_LINKS = [
  { label: 'Solutions', href: '#features' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Enterprise Pricing', href: '#pricing' },
  { label: 'API Docs', href: '#docs' },
] as const;

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 flex justify-center"
        style={{ zIndex: 100, paddingTop: '20px' }}
      >
        <motion.nav
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="flex items-center gap-6 px-4 py-2 rounded-full transition-all"
          style={{
            background: scrolled
              ? 'rgba(5,11,20,0.85)'
              : 'rgba(5,11,20,0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: scrolled
              ? '0 8px 40px rgba(0,0,0,0.5)'
              : '0 2px 16px rgba(0,0,0,0.3)',
            transitionDuration: '400ms',
            transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
          }}
        >
          {/* Logo */}
          <a
            href="/"
            className="flex items-center gap-2.5 mr-4"
            style={{ textDecoration: 'none' }}
          >
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ background: '#00E599', color: '#050B14' }}
            >
              SC
            </span>
            <span
              className="font-bold text-white hidden sm:block"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '15px' }}
            >
              Smart<span style={{ color: '#00E599' }}>Chain</span>
            </span>
          </a>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => {
                  if (link.href.startsWith('#')) {
                    e.preventDefault();
                    const target = document.querySelector(link.href);
                    if (target) {
                      const absoluteTop = window.scrollY + target.getBoundingClientRect().top - 80;
                      window.scrollTo({ top: absoluteTop, behavior: 'instant' });
                    }
                  }
                }}
                className="px-4 py-1.5 rounded-full text-sm font-medium text-white/70 hover:text-white hover:bg-white/8 transition-all cursor-pointer"
                style={{
                  transitionDuration: '300ms',
                  transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3 ml-4">
            <a
              href="/login"
              className="hidden sm:block px-4 py-1.5 rounded-full text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Sign In
            </a>
            <a
              href="/login"
              className="group flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-[0.97]"
              style={{
                background: '#00E599',
                color: '#050B14',
                boxShadow: '0 0 20px rgba(0,229,153,0.35)',
                transitionDuration: '350ms',
                transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
              }}
            >
              Contact Sales
            </a>

            {/* Hamburger – mobile */}
            <button
              className="lg:hidden w-8 h-8 flex flex-col justify-center items-center gap-[5px] ml-1"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              <span
                className="w-5 h-[1.5px] bg-white transition-all duration-300"
                style={{
                  transform: menuOpen ? 'rotate(45deg) translateY(6.5px)' : 'none',
                }}
              />
              <span
                className="w-5 h-[1.5px] bg-white transition-all duration-300"
                style={{ opacity: menuOpen ? 0 : 1 }}
              />
              <span
                className="w-5 h-[1.5px] bg-white transition-all duration-300"
                style={{
                  transform: menuOpen ? 'rotate(-45deg) translateY(-6.5px)' : 'none',
                }}
              />
            </button>
          </div>
        </motion.nav>
      </header>

      {/* Mobile fullscreen menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 flex flex-col items-center justify-center gap-8"
            style={{
              zIndex: 90,
              background: 'rgba(5,11,20,0.92)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
            }}
          >
            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link.label}
                href={link.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ delay: i * 0.06, duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                className="text-3xl font-bold text-white hover:text-[#00E599] transition-colors cursor-pointer"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                onClick={(e) => {
                  setMenuOpen(false);
                  if (link.href.startsWith('#')) {
                    e.preventDefault();
                    const target = document.querySelector(link.href);
                    if (target) {
                      const absoluteTop = window.scrollY + target.getBoundingClientRect().top - 80;
                      window.scrollTo({ top: absoluteTop, behavior: 'instant' });
                    }
                  }
                }}
              >
                {link.label}
              </motion.a>
            ))}
            <motion.a
              href="/login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.28, duration: 0.35 }}
              className="mt-4 px-8 py-3 rounded-full font-semibold text-lg"
              style={{ background: '#00E599', color: '#050B14' }}
            >
              Contact Sales
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
