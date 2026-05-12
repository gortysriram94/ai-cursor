"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  pulsePhase: number;
  pulseSpeed: number;
  energy: number;
}

export default function ParticleField({ height = 600 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark = () =>
      document.documentElement.getAttribute("data-theme") !== "light";

    const PARTICLE_COUNT = 55;
    const CONNECTION_DISTANCE = 130;
    const ACCENT_DARK = [218, 119, 86];   // #DA7756
    const ACCENT_LIGHT = [192, 94, 62];   // #C05E3E

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    const initParticles = () => {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.28;
        return {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1.2 + Math.random() * 1.8,
          opacity: 0.25 + Math.random() * 0.45,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.008 + Math.random() * 0.016,
          energy: Math.random(),
        };
      });
    };

    const draw = () => {
      const dark = isDark();
      const [r, g, b] = dark ? ACCENT_DARK : ACCENT_LIGHT;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;

      // Update
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulsePhase += p.pulseSpeed;

        // Soft wrap at edges
        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;
        if (p.y < -20) p.y = canvas.height + 20;
        if (p.y > canvas.height + 20) p.y = -20;

        // Slight velocity drift — organic feel
        p.vx += (Math.random() - 0.5) * 0.003;
        p.vy += (Math.random() - 0.5) * 0.003;
        // Speed clamp
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (spd > 0.45) { p.vx *= 0.45 / spd; p.vy *= 0.45 / spd; }
        if (spd < 0.08) { p.vx *= 1.05; p.vy *= 1.05; }
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > CONNECTION_DISTANCE) continue;

          const strength = 1 - dist / CONNECTION_DISTANCE;
          const lineOpacity = strength * 0.18;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${r},${g},${b},${lineOpacity})`;
          ctx.lineWidth = strength * 0.8;
          ctx.stroke();
        }
      }

      // Draw particles
      for (const p of particles) {
        const pulse = Math.sin(p.pulsePhase) * 0.3 + 0.7;
        const finalOpacity = p.opacity * pulse;
        const finalRadius = p.radius * (0.85 + pulse * 0.15);

        // Outer glow ring on high-energy particles
        if (p.energy > 0.75) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, finalRadius * 2.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${finalOpacity * 0.12})`;
          ctx.fill();
        }

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, finalRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${finalOpacity})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    resize();
    initParticles();
    draw();

    const ro = new ResizeObserver(() => {
      resize();
      initParticles();
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
      }}
    />
  );
}