import { useEffect, useRef, useState } from 'react';
import brightSkyBackdropImg from '../assets/images/bright_sky_aviation_backdrop_1795055898145.jpg';

interface CloudPuff {
  x: number;
  yRatio: number;
  width: number;
  height: number;
  speed: number;
  layer: 'back' | 'front';
}

interface PlaneState {
  x: number;
  yRatio: number;
  vx: number;
  vy: number;
  scale: number;
  direction: 1 | -1;
  trail: Array<{ x: number; y: number }>;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  thickness: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleSpeed: number;
  baseAlpha: number;
}

type TimePhase = 'Hujan' | 'Pagi' | 'Siang' | 'Malam';

interface WeatherState {
  phase: TimePhase;
  storm: number; // 0 (sunny) to 1 (heavy rain)
  morningFactor: number; // 0 to 1
  nightFactor: number; // 0 to 1
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Fast continuous 36-second cycle:
 * 0s - 7s (7s): Hujan & Mendung (Initial entry greeting!)
 * 7s - 14s (7s): Pagi (Golden sunrise)
 * 14s - 23s (9s): Siang (Bright daylight)
 * 23s - 32s (9s): Malam (Starry night)
 * 32s - 36s (4s): Transition back to Hujan
 */
function getWeatherState(elapsedSec: number): WeatherState {
  const cycle = elapsedSec % 36;

  if (cycle < 7) {
    // Rain / Storm (Initial entry)
    return { phase: 'Hujan', storm: 1, morningFactor: 0, nightFactor: 0 };
  } else if (cycle < 14) {
    // Transitioning from Rain to Pagi
    const t = (cycle - 7) / 7;
    const smoothT = t * t * (3 - 2 * t);
    return {
      phase: 'Pagi',
      storm: lerp(1, 0, smoothT),
      morningFactor: smoothT,
      nightFactor: 0,
    };
  } else if (cycle < 23) {
    // Pagi to Siang
    const t = (cycle - 14) / 9;
    const smoothT = t * t * (3 - 2 * t);
    return {
      phase: 'Siang',
      storm: 0,
      morningFactor: lerp(1, 0, smoothT),
      nightFactor: 0,
    };
  } else if (cycle < 32) {
    // Siang to Malam
    const t = (cycle - 23) / 9;
    const smoothT = t * t * (3 - 2 * t);
    return {
      phase: 'Malam',
      storm: 0,
      morningFactor: 0,
      nightFactor: smoothT,
    };
  } else {
    // Malam back to Hujan
    const t = (cycle - 32) / 4;
    const smoothT = t * t * (3 - 2 * t);
    return {
      phase: 'Hujan',
      storm: smoothT,
      morningFactor: 0,
      nightFactor: lerp(1, 0, smoothT),
    };
  }
}

function drawCommercialAirliner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale: number,
  direction: 1 | -1,
  storm: number,
  nightFactor: number,
  beaconPhase: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(direction * scale, scale);

  ctx.shadowColor = 'rgba(8, 22, 42, 0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // Far wing
  ctx.fillStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(10, -4);
  ctx.lineTo(-14, -26);
  ctx.lineTo(-22, -26);
  ctx.lineTo(-6, -4);
  ctx.closePath();
  ctx.fill();

  // Vertical tailfin
  ctx.fillStyle = '#0F2E54';
  ctx.beginPath();
  ctx.moveTo(-36, -5);
  ctx.lineTo(-56, -26);
  ctx.lineTo(-63, -26);
  ctx.lineTo(-52, -3);
  ctx.closePath();
  ctx.fill();

  // Gold stripe on tailfin
  ctx.fillStyle = '#E5C158';
  ctx.beginPath();
  ctx.moveTo(-42, -5);
  ctx.lineTo(-57, -23);
  ctx.lineTo(-59.5, -23);
  ctx.lineTo(-47, -4);
  ctx.closePath();
  ctx.fill();

  // Horizontal rear stabilizer
  ctx.fillStyle = '#94A3B8';
  ctx.beginPath();
  ctx.moveTo(-42, 1);
  ctx.lineTo(-58, -6);
  ctx.lineTo(-62, -5);
  ctx.lineTo(-49, 2);
  ctx.closePath();
  ctx.fill();

  // Fuselage
  ctx.fillStyle = nightFactor > 0.5 ? '#F1F5F9' : '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(58, 2);
  ctx.quadraticCurveTo(54, -8, 34, -8);
  ctx.lineTo(-34, -7.5);
  ctx.lineTo(-56, -2);
  ctx.quadraticCurveTo(-58, 3, -52, 4.5);
  ctx.lineTo(-20, 7);
  ctx.lineTo(36, 7);
  ctx.quadraticCurveTo(56, 6.5, 58, 2);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Underbelly
  ctx.fillStyle = '#123866';
  ctx.beginPath();
  ctx.moveTo(49, 3.5);
  ctx.lineTo(34, 7);
  ctx.lineTo(-22, 7);
  ctx.lineTo(-52, 4.5);
  ctx.lineTo(-54, 2.5);
  ctx.lineTo(44, 2.5);
  ctx.closePath();
  ctx.fill();

  // Gold line
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(-46, 1.2, 88, 1.3);

  // Cockpit window
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.moveTo(48, -2.5);
  ctx.lineTo(40, -6);
  ctx.lineTo(36, -6);
  ctx.lineTo(38, -2.2);
  ctx.closePath();
  ctx.fill();

  // Cabin windows (bright yellow glow at night or storm)
  ctx.fillStyle = nightFactor > 0.4 || storm > 0.35 ? '#FDE68A' : '#1E293B';
  for (let wx = -32; wx <= 28; wx += 4.6) {
    ctx.fillRect(wx, -3.6, 2.4, 2.1);
  }

  // Near wing
  ctx.fillStyle = '#E2E8F0';
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(14, 3);
  ctx.lineTo(-16, 22);
  ctx.lineTo(-24, 21.5);
  ctx.lineTo(-4, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Jet engine
  ctx.fillStyle = '#1E3A5F';
  ctx.beginPath();
  ctx.roundRect(-2, 8.5, 16, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(11, 8.8, 3, 5.4);

  // Headlight beam during night or storm
  if (nightFactor > 0.4 || storm > 0.25) {
    const beamAlpha = Math.max(nightFactor, storm) * 0.35;
    const beamGrad = ctx.createLinearGradient(56, 3, 150, 15);
    beamGrad.addColorStop(0, `rgba(255, 249, 214, ${beamAlpha})`);
    beamGrad.addColorStop(1, 'rgba(255, 249, 214, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(56, 2);
    ctx.lineTo(150, -10);
    ctx.lineTo(150, 24);
    ctx.closePath();
    ctx.fill();
  }

  // Strobe & Beacon
  if (beaconPhase > 0.82) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-21, 21.5, 2.4, 0, Math.PI * 2);
    ctx.arc(-59, -26, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  if (beaconPhase > 0.4 && beaconPhase < 0.56) {
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, -8.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function SkyMotionBackdrop() {
  const [bgError, setBgError] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<TimePhase>('Hujan');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tintRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const clouds: CloudPuff[] = [
      { x: width * 0.12, yRatio: 0.13, width: 420, height: 110, speed: 16, layer: 'back' },
      { x: width * 0.52, yRatio: 0.19, width: 520, height: 125, speed: 12, layer: 'back' },
      { x: width * 0.88, yRatio: 0.14, width: 460, height: 115, speed: 19, layer: 'back' },
      { x: width * 0.25, yRatio: 0.48, width: 560, height: 135, speed: 14, layer: 'front' },
      { x: width * 0.72, yRatio: 0.55, width: 610, height: 145, speed: 11, layer: 'front' },
      { x: width * 0.1, yRatio: 0.78, width: 640, height: 155, speed: 9, layer: 'front' },
      { x: width * 0.62, yRatio: 0.84, width: 590, height: 140, speed: 13, layer: 'front' },
    ];

    const planes: PlaneState[] = [
      {
        x: width * 0.18,
        yRatio: 0.17,
        vx: 78,
        vy: -5,
        scale: 1.18,
        direction: 1,
        trail: [],
      },
      {
        x: width * 0.78,
        yRatio: 0.43,
        vx: -62,
        vy: -3.5,
        scale: 0.92,
        direction: -1,
        trail: [],
      },
      {
        x: width * 0.45,
        yRatio: 0.74,
        vx: 54,
        vy: -2.2,
        scale: 0.78,
        direction: 1,
        trail: [],
      },
    ];

    const raindrops: RainDrop[] = Array.from({ length: 170 }, () => ({
      x: Math.random() * (width + 200) - 100,
      y: Math.random() * height,
      len: 16 + Math.random() * 24,
      speed: 620 + Math.random() * 420,
      alpha: 0.28 + Math.random() * 0.42,
      thickness: 1 + Math.random() * 0.9,
    }));

    const stars: Star[] = Array.from({ length: 90 }, () => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.65),
      size: 1 + Math.random() * 1.8,
      twinkleSpeed: 1.5 + Math.random() * 3,
      baseAlpha: 0.3 + Math.random() * 0.6,
    }));

    let rafId = 0;
    const startTime = performance.now();
    let lastTime = startTime;
    let lastReportedPhase: TimePhase = 'Hujan';

    const drawFrame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const elapsedSec = (now - startTime) / 1000;

      const weather = getWeatherState(elapsedSec);
      if (weather.phase !== lastReportedPhase) {
        lastReportedPhase = weather.phase;
        setCurrentPhase(weather.phase);
      }

      const { storm, morningFactor, nightFactor } = weather;

      // Update tint overlay depending on time phase (Hujan, Pagi, Siang, Malam)
      if (tintRef.current) {
        if (nightFactor > 0.05) {
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(10, 15, 30, ${0.82 * nightFactor}), rgba(5, 8, 20, ${0.9 * nightFactor}))`;
          tintRef.current.style.opacity = String(nightFactor);
        } else if (morningFactor > 0.05) {
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(217, 119, 6, ${0.38 * morningFactor}), rgba(30, 58, 138, ${0.45 * morningFactor}))`;
          tintRef.current.style.opacity = String(morningFactor);
        } else if (storm > 0.05) {
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(51, 65, 85, ${0.82 * storm}), rgba(30, 41, 59, ${0.88 * storm}))`;
          tintRef.current.style.opacity = String(storm * 0.85);
        } else {
          tintRef.current.style.opacity = '0';
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Draw Twinkling Stars during Malam
      if (nightFactor > 0.05) {
        ctx.save();
        ctx.globalAlpha = nightFactor;
        for (const star of stars) {
          const alpha =
            star.baseAlpha *
            (0.5 + 0.5 * Math.sin(now * 0.001 * star.twinkleSpeed + star.x));
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Sun / Moon / Glow
      if (morningFactor > 0.05) {
        // Sunrise golden glow
        const sunGrad = ctx.createRadialGradient(
          width * 0.15,
          height * 0.22,
          10,
          width * 0.15,
          height * 0.22,
          width * 0.55
        );
        sunGrad.addColorStop(0, `rgba(255, 200, 87, ${0.55 * morningFactor})`);
        sunGrad.addColorStop(0.5, `rgba(245, 158, 11, ${0.25 * morningFactor})`);
        sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (nightFactor > 0.05) {
        // Moonlight glow
        const moonGrad = ctx.createRadialGradient(
          width * 0.85,
          height * 0.15,
          5,
          width * 0.85,
          height * 0.15,
          width * 0.35
        );
        moonGrad.addColorStop(0, `rgba(224, 242, 254, ${0.35 * nightFactor})`);
        moonGrad.addColorStop(1, 'rgba(224, 242, 254, 0)');
        ctx.fillStyle = moonGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (storm < 0.2) {
        // Siang sunbeams
        const sunStrength = (1 - storm) * (1 - morningFactor) * (1 - nightFactor);
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.0005);
        const beamGrad = ctx.createRadialGradient(
          width * 0.08,
          height * 0.06,
          10,
          width * 0.24,
          height * 0.2,
          Math.max(width, height) * 0.75
        );
        beamGrad.addColorStop(0, `rgba(255, 252, 235, ${(0.24 + pulse * 0.08) * sunStrength})`);
        beamGrad.addColorStop(0.45, `rgba(224, 244, 255, ${(0.1 + pulse * 0.04) * sunStrength})`);
        beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // Lightning during storm
      let lightningGlow = 0;
      if (storm > 0.75) {
        const flashTick = (elapsedSec * 1.8) % 6.5;
        if (flashTick > 6.2 && flashTick < 6.38) {
          lightningGlow = 0.25;
        }
      }

      // Clouds
      for (const cloud of clouds) {
        if (!prefersReducedMotion) {
          const speedBoost = 1 + storm * 0.9;
          cloud.x += cloud.speed * speedBoost * dt;
          if (cloud.x - cloud.width * 0.65 > width) {
            cloud.x = -cloud.width * 0.65;
          }
        }

        const cy = height * cloud.yRatio;
        const rCenter = Math.round(lerp(255, 68, Math.max(storm, nightFactor * 0.7)) + lightningGlow * 180);
        const gCenter = Math.round(lerp(255, 82, Math.max(storm, nightFactor * 0.7)) + lightningGlow * 180);
        const bCenter = Math.round(lerp(255, 105, Math.max(storm, nightFactor * 0.7)) + lightningGlow * 200);

        const rEdge = Math.round(lerp(240, 42, Math.max(storm, nightFactor * 0.7)));
        const gEdge = Math.round(lerp(249, 53, Math.max(storm, nightFactor * 0.7)));
        const bEdge = Math.round(lerp(255, 72, Math.max(storm, nightFactor * 0.7)));

        const baseAlpha = lerp(
          cloud.layer === 'back' ? 0.26 : 0.22,
          cloud.layer === 'back' ? 0.65 : 0.58,
          Math.max(storm, nightFactor * 0.6)
        );

        const grad = ctx.createRadialGradient(
          cloud.x,
          cy,
          cloud.height * 0.12,
          cloud.x,
          cy,
          cloud.width * 0.58
        );
        grad.addColorStop(0, `rgba(${rCenter}, ${gCenter}, ${bCenter}, ${baseAlpha})`);
        grad.addColorStop(0.55, `rgba(${rEdge}, ${gEdge}, ${bEdge}, ${baseAlpha * 0.52})`);
        grad.addColorStop(1, `rgba(${rEdge}, ${gEdge}, ${bEdge}, 0)`);

        ctx.save();
        ctx.scale(1, cloud.height / (cloud.width * 0.5));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(
          cloud.x,
          cy * ((cloud.width * 0.5) / cloud.height),
          cloud.width * 0.58,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }

      // Airplanes
      for (let i = 0; i < planes.length; i++) {
        const plane = planes[i];
        if (!prefersReducedMotion) {
          plane.x += plane.vx * dt;
          plane.yRatio += (plane.vy * dt) / Math.max(height, 1);

          const py = plane.yRatio * height;
          const tailAnchorX = plane.x - plane.direction * 46 * plane.scale;
          const lastPoint = plane.trail[plane.trail.length - 1];
          if (!lastPoint || Math.hypot(tailAnchorX - lastPoint.x, py - lastPoint.y) > 9) {
            plane.trail.push({ x: tailAnchorX, y: py });
            if (plane.trail.length > 34) {
              plane.trail.shift();
            }
          }

          if (plane.vx > 0 && plane.x > width + 180) {
            plane.x = -180;
            plane.yRatio = [0.16, 0.42, 0.72][i % 3];
            plane.trail = [];
          } else if (plane.vx < 0 && plane.x < -180) {
            plane.x = width + 180;
            plane.yRatio = [0.22, 0.45, 0.68][i % 3];
            plane.trail = [];
          }
        }

        const py = plane.yRatio * height;
        const rawAngle = Math.atan2(plane.vy, Math.abs(plane.vx));
        const visualAngle = plane.direction === 1 ? rawAngle : -rawAngle;

        if (plane.trail.length > 2) {
          for (let j = 1; j < plane.trail.length; j++) {
            const p0 = plane.trail[j - 1];
            const p1 = plane.trail[j];
            const ratio = j / plane.trail.length;
            const trailAlpha = ratio * lerp(0.45, 0.22, storm);
            ctx.strokeStyle = `rgba(255, 255, 255, ${trailAlpha})`;
            ctx.lineWidth = (1.6 + (1 - ratio) * 3.2) * plane.scale;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
          }
        }

        const beaconPhase = ((elapsedSec + i * 0.42) % 1.35) / 1.35;
        drawCommercialAirliner(
          ctx,
          plane.x,
          py,
          visualAngle,
          plane.scale,
          plane.direction,
          storm,
          nightFactor,
          beaconPhase
        );
      }

      // Rain
      if (storm > 0.18 && !prefersReducedMotion) {
        const rainIntensity = clamp01((storm - 0.18) / 0.62);
        const activeDrops = Math.floor(raindrops.length * rainIntensity);
        const windDx = -145;

        ctx.lineCap = 'round';
        for (let i = 0; i < activeDrops; i++) {
          const drop = raindrops[i];
          drop.x += windDx * dt;
          drop.y += drop.speed * dt;

          if (drop.y > height + 30 || drop.x < -120) {
            drop.y = -30 - Math.random() * 80;
            drop.x = Math.random() * (width + 240);
          }

          ctx.strokeStyle = `rgba(226, 240, 255, ${drop.alpha * rainIntensity})`;
          ctx.lineWidth = drop.thickness;
          ctx.beginPath();
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + (windDx / drop.speed) * drop.len, drop.y + drop.len);
          ctx.stroke();
        }
      }

      if (!prefersReducedMotion && !document.hidden) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const handleVisibility = () => {
      if (!document.hidden && !prefersReducedMotion) {
        lastTime = performance.now();
        window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    rafId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-sky-200">
      {!bgError && (
        <img
          src={brightSkyBackdropImg}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={() => setBgError(true)}
          className="sky-camera-drift h-full w-full object-cover object-center opacity-100"
        />
      )}

      {/* Dynamic Time / Weather Tint Overlay */}
      <div
        ref={tintRef}
        aria-hidden="true"
        className="absolute inset-0 transition-all duration-300"
      />

      {/* Canvas for Clouds, Planes, Stars & Rain */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      />

      {/* Live Time / Weather Badge Indicator */}
      <div className="absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/60 px-3 py-1.5 backdrop-blur-md text-[11px] font-medium text-slate-200 shadow-lg">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4AF37] opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D4AF37]"></span>
        </span>
        <span>
          {currentPhase === 'Hujan' && '🌧️ Menyambut dengan Hujan & Mendung'}
          {currentPhase === 'Pagi' && '🌅 Pagi · Suasana Matahari Terbit'}
          {currentPhase === 'Siang' && '☀️ Siang · Langit Terang & Pesawat Melintas'}
          {currentPhase === 'Malam' && '🌙 Malam · Bintang Berkelip & Lampu Kabin'}
        </span>
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-sky-900/15 via-transparent to-sky-950/20" />
    </div>
  );
}
