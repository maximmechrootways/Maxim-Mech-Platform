"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimatedGradientBackgroundProps {
  className?: string;
  children?: ReactNode;
  intensity?: "subtle" | "medium" | "strong";
  layout?: "screen" | "container";
}

interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}

function createBeam(width: number, height: number): Beam {
  const angle = -35 + Math.random() * 10;
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle,
    speed: 0.6 + Math.random() * 1.2,
    opacity: 0.12 + Math.random() * 0.16,
    hue: 190 + Math.random() * 70,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
  };
}

export function BeamsBackground({
  className,
  intensity = "strong",
  layout = "screen",
  children,
}: AnimatedGradientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<Beam[]>([]);
  const animationFrameRef = useRef<number>(0);
  const sizeRef = useRef<{ width: number; height: number; dpr: number }>({
    width: 0,
    height: 0,
    dpr: 1,
  });
  const MINIMUM_BEAMS = 20;

  const opacityMap: Record<"subtle" | "medium" | "strong", number> = {
    subtle: 0.7,
    medium: 0.85,
    strong: 1,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      sizeRef.current = { width, height, dpr };

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Important: avoid accumulating transforms across resizes.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const totalBeams = MINIMUM_BEAMS * 1.5;
      beamsRef.current = Array.from({ length: totalBeams }, () =>
        createBeam(width, height)
      );
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);

    function resetBeam(beam: Beam, index: number, totalBeams: number) {
      const { width, height } = sizeRef.current;

      const column = index % 3;
      const spacing = width / 3;

      beam.y = height + 100;
      beam.x =
        column * spacing +
        spacing / 2 +
        (Math.random() - 0.5) * spacing * 0.5;
      beam.width = 100 + Math.random() * 100;
      beam.speed = 0.5 + Math.random() * 0.4;
      beam.hue = 190 + (index * 70) / totalBeams;
      beam.opacity = 0.2 + Math.random() * 0.1;
    }

    function drawBeam(ctx2: CanvasRenderingContext2D, beam: Beam) {
      ctx2.save();
      ctx2.translate(beam.x, beam.y);
      ctx2.rotate((beam.angle * Math.PI) / 180);

      // Calculate pulsing opacity
      const pulsingOpacity =
        beam.opacity *
        (0.8 + Math.sin(beam.pulse) * 0.2) *
        opacityMap[intensity];

      const gradient = ctx2.createLinearGradient(0, 0, 0, beam.length);

      // Enhanced gradient with multiple color stops
      gradient.addColorStop(0, `hsla(${beam.hue}, 85%, 65%, 0)`);
      gradient.addColorStop(
        0.1,
        `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity * 0.5})`
      );
      gradient.addColorStop(
        0.4,
        `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity})`
      );
      gradient.addColorStop(
        0.6,
        `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity})`
      );
      gradient.addColorStop(
        0.9,
        `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity * 0.5})`
      );
      gradient.addColorStop(1, `hsla(${beam.hue}, 85%, 65%, 0)`);

      ctx2.fillStyle = gradient;
      ctx2.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx2.restore();
    }

    function animate() {
      const { width, height } = sizeRef.current;
      if (!canvas || !ctx || width === 0 || height === 0) return;

      ctx.clearRect(0, 0, width, height);
      ctx.filter = "blur(35px)";

      const totalBeams = beamsRef.current.length;
      beamsRef.current.forEach((beam, index) => {
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;

        // Reset beam when it goes off screen
        if (beam.y + beam.length < -100) {
          resetBeam(beam, index, totalBeams);
        }

        drawBeam(ctx, beam);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [intensity]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-app bg-app-light dark:bg-neutral-950",
        layout === "screen" ? "min-h-screen" : "h-full min-h-0",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 blur-[15px]"
      />

      <style>{`
        @keyframes beamsOverlayOpacity {
          0% { opacity: 0.05; }
          50% { opacity: 0.15; }
          100% { opacity: 0.05; }
        }
        .beamsOverlay {
          animation: beamsOverlayOpacity 10s ease-in-out infinite;
        }
      `}</style>

      <div className="beamsOverlay absolute inset-0 bg-neutral-950/5 dark:bg-neutral-950/5 backdrop-blur-[50px]" />

      <div className={cn("relative z-10", layout === "container" && "h-full min-h-0")}>
        {children}
      </div>
    </div>
  );
}

