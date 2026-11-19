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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Returns weather darkness/storm intensity (0 = bright sunny, 1 = overcast & rain)
 * Smooth 30-second continuous cycle:
 * 0-7s: Sunny daylight
 * 7-12s: Clouds gather & darken
 * 12-24s: Overcast storm clouds & rain
 * 24-30s: Clearing back to bright sunny sky
 */
function getWeatherFactor(elapsedSec: number): number {
  const cycle = elapsedSec % 30;
  if (cycle < 7) return 0;
  if (cycle < 12) {
    const t = (cycle - 7) / 5;
    return t * t * (3 - 2 * t);
  }
  if (cycle < 24) return 1;
  const t = (cycle - 24) / 6;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Draws a crisp, unmistakable commercial airliner in side/three-quarter profile
 * facing right (+X). Flip horizontally when flying left.
 */
function drawCommercialAirliner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale: number,
  direction: 1 | -1,
  stormFactor: number,
  beaconPhase: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(direction * scale, scale);

  // Drop shadow for crisp visibility against both bright white clouds and gray storm clouds
  ctx.shadowColor = 'rgba(8, 22, 42, 0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // Far wing (behind fuselage)
  ctx.fillStyle = '#CBD5E1';
  ctx.beginPath();
  ctx.moveTo(10, -4);
  ctx.lineTo(-14, -26);
  ctx.lineTo(-22, -26);
  ctx.lineTo(-6, -4);
  ctx.closePath();
  ctx.fill();

  // Vertical tailfin (Nusantara navy & gold livery)
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

  // Main fuselage (white upper body)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(58, 2); // Nose tip
  ctx.quadraticCurveTo(54, -8, 34, -8); // Forehead/cockpit curve
  ctx.lineTo(-34, -7.5);
  ctx.lineTo(-56, -2);
  ctx.quadraticCurveTo(-58, 3, -52, 4.5);
  ctx.lineTo(-20, 7);
  ctx.lineTo(36, 7);
  ctx.quadraticCurveTo(56, 6.5, 58, 2);
  ctx.closePath();
  ctx.fill();

  // Turn off heavy shadow for crisp interior details
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Deep navy underbelly & cheatline
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

  // Gold fuselage accent line
  ctx.fillStyle = '#D4AF37';
  ctx.fillRect(-46, 1.2, 88, 1.3);

  // Cockpit windshield
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.moveTo(48, -2.5);
  ctx.lineTo(40, -6);
  ctx.lineTo(36, -6);
  ctx.lineTo(38, -2.2);
  ctx.closePath();
  ctx.fill();

  // Passenger cabin windows
  ctx.fillStyle = stormFactor > 0.35 ? '#FDE68A' : '#1E293B';
  for (let wx = -32; wx <= 28; wx += 4.6) {
    ctx.fillRect(wx, -3.6, 2.4, 2.1);
  }

  // Near main swept wing
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

  // Near jet engine pod under wing
  ctx.fillStyle = '#1E3A5F';
  ctx.beginPath();
  ctx.roundRect(-2, 8.5, 16, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(11, 8.8, 3, 5.4);

  // Landing headlight beam during overcast/rain
  if (stormFactor > 0.25) {
    const beamAlpha = stormFactor * 0.28;
    const beamGrad = ctx.createLinearGradient(56, 3, 145, 14);
    beamGrad.addColorStop(0, `rgba(255, 249, 214, ${beamAlpha})`);
    beamGrad.addColorStop(1, 'rgba(255, 249, 214, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(56, 2);
    ctx.lineTo(145, -8);
    ctx.lineTo(145, 22);
    ctx.closePath();
    ctx.fill();
  }

  // Flashing wingtip/tail strobe & red anti-collision beacon
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stormTintRef = useRef<HTMLDivElement | null>(null);

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

    // Rich cloud layers that shift from sunny white to overcast storm gray
    const clouds: CloudPuff[] = [
      { x: width * 0.12, yRatio: 0.13, width: 420, height: 110, speed: 16, layer: 'back' },
      { x: width * 0.52, yRatio: 0.19, width: 520, height: 125, speed: 12, layer: 'back' },
      { x: width * 0.88, yRatio: 0.14, width: 460, height: 115, speed: 19, layer: 'back' },
      { x: width * 0.25, yRatio: 0.48, width: 560, height: 135, speed: 14, layer: 'front' },
      { x: width * 0.72, yRatio: 0.55, width: 610, height: 145, speed: 11, layer: 'front' },
      { x: width * 0.1, yRatio: 0.78, width: 640, height: 155, speed: 9, layer: 'front' },
      { x: width * 0.62, yRatio: 0.84, width: 590, height: 140, speed: 13, layer: 'front' },
    ];

    // 3 clearly visible commercial airliners flying across screen
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

    // Raindrops pool
    const rainCount = 170;
    const raindrops: RainDrop[] = Array.from({ length: rainCount }, () => ({
      x: Math.random() * (width + 200) - 100,
      y: Math.random() * height,
      len: 16 + Math.random() * 24,
      speed: 620 + Math.random() * 420,
      alpha: 0.28 + Math.random() * 0.42,
      thickness: 1 + Math.random() * 0.9,
    }));

    let rafId = 0;
    const startTime = performance.now();
    let lastTime = startTime;

    const drawFrame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const elapsedSec = (now - startTime) / 1000;

      const storm = prefersReducedMotion ? 0 : getWeatherFactor(elapsedSec);

      // Update backdrop overcast tint smoothly without touching React state every frame
      if (stormTintRef.current) {
        stormTintRef.current.style.opacity = String(storm * 0.78);
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Sunbeam glow (strong when sunny, fades out during storm)
      const sunStrength = 1 - storm;
      if (sunStrength > 0.02) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.0005);
        const beamGrad = ctx.createRadialGradient(
          width * 0.08,
          height * 0.06,
          10,
          width * 0.24,
          height * 0.2,
          Math.max(width, height) * 0.75
        );
        beamGrad.addColorStop(
          0,
          `rgba(255, 252, 235, ${(0.24 + pulse * 0.08) * sunStrength})`
        );
        beamGrad.addColorStop(
          0.45,
          `rgba(224, 244, 255, ${(0.1 + pulse * 0.04) * sunStrength})`
        );
        beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Subtle lightning flash inside storm clouds during rain
      let lightningGlow = 0;
      if (storm > 0.75) {
        const flashTick = (elapsedSec * 1.7) % 7.5;
        if (flashTick > 7.22 && flashTick < 7.42) {
          lightningGlow = 0.22;
        }
      }

      // 3. Clouds (smoothly morph from sunlit white to dark overcast slate-gray)
      for (const cloud of clouds) {
        if (!prefersReducedMotion) {
          const speedBoost = 1 + storm * 0.9;
          cloud.x += cloud.speed * speedBoost * dt;
          if (cloud.x - cloud.width * 0.65 > width) {
            cloud.x = -cloud.width * 0.65;
          }
        }

        const cy = height * cloud.yRatio;
        const rCenter = Math.round(lerp(255, 76, storm) + lightningGlow * 180);
        const gCenter = Math.round(lerp(255, 92, storm) + lightningGlow * 180);
        const bCenter = Math.round(lerp(255, 114, storm) + lightningGlow * 200);

        const rEdge = Math.round(lerp(240, 51, storm));
        const gEdge = Math.round(lerp(249, 65, storm));
        const bEdge = Math.round(lerp(255, 85, storm));

        const baseAlpha = lerp(
          cloud.layer === 'back' ? 0.26 : 0.22,
          cloud.layer === 'back' ? 0.62 : 0.56,
          storm
        );

        const grad = ctx.createRadialGradient(
          cloud.x,
          cy,
          cloud.height * 0.12,
          cloud.x,
          cy,
          cloud.width * 0.58
        );
        grad.addColorStop(
          0,
          `rgba(${clamp01(rCenter / 255) * 255}, ${clamp01(gCenter / 255) * 255}, ${clamp01(bCenter / 255) * 255}, ${baseAlpha})`
        );
        grad.addColorStop(
          0.55,
          `rgba(${rEdge}, ${gEdge}, ${bEdge}, ${baseAlpha * 0.52})`
        );
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

      // 4. Clearly visible cruising aircraft + contrails
      for (let i = 0; i < planes.length; i++) {
        const plane = planes[i];
        if (!prefersReducedMotion) {
          plane.x += plane.vx * dt;
          plane.yRatio += (plane.vy * dt) / Math.max(height, 1);

          const py = plane.yRatio * height;
          const tailAnchorX = plane.x - plane.direction * 46 * plane.scale;
          const lastPoint = plane.trail[plane.trail.length - 1];
          if (
            !lastPoint ||
            Math.hypot(tailAnchorX - lastPoint.x, py - lastPoint.y) > 9
          ) {
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

        // Twin contrail behind plane (lighter in sunny sky, subtle misty wake in rain)
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
          beaconPhase
        );
      }

      // 5. Diagonal Rain streaks when overcast/rain builds up
      if (storm > 0.18 && !prefersReducedMotion) {
        const rainIntensity = clamp01((storm - 0.18) / 0.62);
        const activeDrops = Math.floor(raindrops.length * rainIntensity);
        const windDx = -145; // Subtle diagonal breeze

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

      {/* Smooth Overcast Storm Tint Overlay (controlled smoothly by weather cycle) */}
      <div
        ref={stormTintRef}
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-slate-700/80 via-slate-600/75 to-slate-800/85 opacity-0"
      />

      {/* Live Clouds, Clearly Visible Commercial Airliners, Lightning & Rain Canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      />

      {/* Light sky atmospheric vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-900/15 via-transparent to-sky-950/20" />
    </div>
  );
}
