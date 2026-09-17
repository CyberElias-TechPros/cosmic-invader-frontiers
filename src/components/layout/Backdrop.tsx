import { useEffect, useRef } from 'react';
import { useSettings } from '@/lib/settings';

/**
 * The site backdrop: a slow parallax starfield with drifting nebulae.
 *
 * It runs on one canvas at a capped frame rate, pauses when the tab is hidden
 * and renders a single static frame when the player asks for reduced motion —
 * decoration must never cost frames or trigger motion sensitivity.
 */

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  twinkle: boolean;
  phase: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settings = useSettings();
  const reduced = settings.reducedMotion || settings.particles === 'off';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars: Star[] = [];
    const shooting: ShootingStar[] = [];
    let frame = 0;
    let last = 0;
    let running = true;

    const build = () => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const density = settings.particles === 'reduced' ? 6200 : 3400;
      const count = Math.min(420, Math.max(90, Math.round((width * height) / density)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random(),
        r: 0.4 + Math.random() * 1.5,
        twinkle: Math.random() < 0.45,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const drawStatic = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const alpha = 0.25 + star.z * 0.6;
        ctx.fillStyle = `rgba(${star.z > 0.7 ? '224,242,254' : '150,180,220'},${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const render = (time: number) => {
      if (!running) return;
      frame = requestAnimationFrame(render);
      // Capped at ~40fps: plenty for drifting stars, halves the battery cost.
      if (time - last < 24) return;
      const delta = Math.min(0.06, (time - last) / 1000);
      last = time;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (const star of stars) {
        star.y += (4 + star.z * 16) * delta;
        if (star.y > height + 4) {
          star.y = -4;
          star.x = Math.random() * width;
        }
        const twinkle = star.twinkle ? 0.55 + 0.45 * Math.sin(time * 0.002 + star.phase) : 1;
        const alpha = (0.18 + star.z * 0.62) * twinkle;
        ctx.fillStyle = star.z > 0.75 ? `rgba(224,242,254,${alpha})` : `rgba(150,180,220,${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r * (0.8 + star.z * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      if (shooting.length < 2 && Math.random() < 0.004) {
        shooting.push({
          x: Math.random() * width * 0.8,
          y: Math.random() * height * 0.4,
          vx: 320 + Math.random() * 260,
          vy: 90 + Math.random() * 120,
          life: 0,
          maxLife: 1.1,
        });
      }
      for (let i = shooting.length - 1; i >= 0; i--) {
        const bolt = shooting[i];
        bolt.life += delta;
        bolt.x += bolt.vx * delta;
        bolt.y += bolt.vy * delta;
        const ratio = 1 - bolt.life / bolt.maxLife;
        if (ratio <= 0) {
          shooting.splice(i, 1);
          continue;
        }
        const gradient = ctx.createLinearGradient(bolt.x, bolt.y, bolt.x - bolt.vx * 0.14, bolt.y - bolt.vy * 0.14);
        gradient.addColorStop(0, `rgba(255,255,255,${0.85 * ratio})`);
        gradient.addColorStop(0.4, `rgba(125,211,252,${0.5 * ratio})`);
        gradient.addColorStop(1, 'rgba(125,211,252,0)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bolt.x, bolt.y);
        ctx.lineTo(bolt.x - bolt.vx * 0.14, bolt.y - bolt.vy * 0.14);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
    };

    build();
    drawStatic();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        running = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else if (!reduced && !running) {
        running = true;
        last = 0;
        frame = requestAnimationFrame(render);
      }
    };

    if (!reduced) {
      running = true;
      frame = requestAnimationFrame(render);
    }

    const onResize = () => {
      build();
      if (reduced) drawStatic();
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced, settings.particles]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Deep field base */}
      <div className="absolute inset-0 bg-[#04050d]" />
      {/* Nebula clouds — CSS only, cheap and always smooth */}
      <div className="absolute -left-[12%] top-[-10%] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(109,40,217,0.34),transparent_62%)] blur-3xl animate-drift" />
      <div className="absolute right-[-14%] top-[12%] h-[62vh] w-[58vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(14,116,144,0.32),transparent_62%)] blur-3xl animate-float-slower" />
      <div className="absolute bottom-[-18%] left-[22%] h-[58vh] w-[64vw] rounded-full bg-[radial-gradient(circle_at_center,rgba(190,24,93,0.22),transparent_66%)] blur-3xl animate-float-slow" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-90" />
      <div className="absolute inset-0 grid-floor opacity-[0.55]" />
      {/* Vignette keeps the centre readable and the edges cinematic */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,transparent_10%,rgba(2,3,10,0.55)_60%,rgba(2,3,10,0.92)_100%)]" />
    </div>
  );
}
