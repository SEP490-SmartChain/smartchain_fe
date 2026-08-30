import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * CustomCursor — two-ring neon cursor follower.
 * - Inner dot: follows mouse instantly (lerp 1.0)
 * - Outer ring: follows with lag (lerp 0.08) for trailing feel
 * - Hover on [data-cursor="pointer"] elements: ring expands + inverts
 */
export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;

    // Hide default cursor globally
    document.documentElement.style.cursor = 'none';

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };

    // Hover state
    const onEnter = () => {
      gsap.to(ring, {
        width: 52,
        height: 52,
        borderColor: '#00E599',
        opacity: 0.5,
        duration: 0.3,
        ease: 'power2.out',
      });
      gsap.to(dot, { width: 6, height: 6, duration: 0.2 });
    };
    const onLeave = () => {
      gsap.to(ring, {
        width: 32,
        height: 32,
        borderColor: '#00E599',
        opacity: 0.7,
        duration: 0.3,
        ease: 'power2.out',
      });
      gsap.to(dot, { width: 8, height: 8, duration: 0.2 });
    };

    // Use event delegation for hover states
    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a, button, [data-cursor="pointer"]')) {
        onEnter();
      }
    };

    const onMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a, button, [data-cursor="pointer"]')) {
        onLeave();
      }
    };

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);

    // RAF loop for smooth laggy ring
    let raf: number;
    let isIdle = false;

    const tick = () => {
      // Check if settled
      const dx = mx - rx;
      const dy = my - ry;
      
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
        if (!isIdle) {
          gsap.set(ring, { x: mx - 16, y: my - 16 });
          isIdle = true;
        }
      } else {
        isIdle = false;
        // Dot — snap
        gsap.set(dot, { x: mx - 4, y: my - 4 });
        // Ring — lerp
        rx += dx * 0.09;
        ry += dy * 0.09;
        gsap.set(ring, { x: rx - 16, y: ry - 16 });
      }
      
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('mousemove', onMove);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.style.cursor = '';
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
    };
  }, []);

  return (
    <>
      {/* Outer ring */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full"
        style={{
          width: 32,
          height: 32,
          border: '1.5px solid #00E599',
          opacity: 0.7,
          mixBlendMode: 'difference',
        }}
        aria-hidden="true"
      />
      {/* Inner dot */}
      <div
        ref={dotRef}
        className="pointer-events-none fixed top-0 left-0 z-[9999] rounded-full"
        style={{
          width: 8,
          height: 8,
          background: '#00E599',
          boxShadow: '0 0 10px #00E59999',
        }}
        aria-hidden="true"
      />
    </>
  );
}
