import { useEffect, useRef, useState } from 'react';
import brightSkyBackdropImg from '../assets/images/bright_sky_aviation_backdrop_1795055898145.jpg';
import {
  getSkyTimeState,
  pickRandomWeather,
  SKY_START_TIME,
  type WeatherKind,
} from '../lib/skyTime';

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

interface SnowFlake {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  driftAmp: number;
  driftFreq: number;
  phase: number;
  alpha: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleSpeed: number;
  baseAlpha: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function moveToward(current: number, target: number, maxStep: number): number {
  if (Math.abs(target - current) <= maxStep) return target;
  return current + Math.sign(target - current) * maxStep;
}

function drawCommercialAirliner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale: number,
  direction: 1 | -1,
  rainFactor: number,
  snowFactor: number,
  nightFactor: number,
  soreFactor: number,
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
  ctx.fillStyle = soreFactor > 0.4 ? '#FBCFE8' : '#CBD5E1';
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
  ctx.fillStyle =
    soreFactor > 0.35
      ? '#FFF5EB'
      : nightFactor > 0.5
        ? '#F1F5F9'
        : '#FFFFFF';
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

  // Cabin windows (lit warm yellow during night, rain, snow, or dusk)
  ctx.fillStyle =
    nightFactor > 0.3 || rainFactor > 0.3 || snowFactor > 0.3 || soreFactor > 0.4
      ? '#FDE68A'
      : '#1E293B';
  for (let wx = -32; wx <= 28; wx += 4.6) {
    ctx.fillRect(wx, -3.6, 2.4, 2.1);
  }

  // Near wing
  ctx.fillStyle = soreFactor > 0.35 ? '#FED7AA' : '#E2E8F0';
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

  // Headlight beam during night, rain, snow, or dusk
  const weatherVisibility = Math.max(nightFactor, rainFactor, snowFactor * 0.85, soreFactor * 0.7);
  if (weatherVisibility > 0.25) {
    const beamAlpha = weatherVisibility * 0.35;
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

    const raindrops: RainDrop[] = Array.from({ length: 175 }, () => ({
      x: Math.random() * (width + 200) - 100,
      y: Math.random() * height,
      len: 16 + Math.random() * 24,
      speed: 620 + Math.random() * 420,
      alpha: 0.28 + Math.random() * 0.42,
      thickness: 1 + Math.random() * 0.9,
    }));

    const snowflakes: SnowFlake[] = Array.from({ length: 185 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1.6 + Math.random() * 3.4,
      speedY: 42 + Math.random() * 68,
      driftAmp: 16 + Math.random() * 28,
      driftFreq: 0.7 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.45 + Math.random() * 0.5,
    }));

    const stars: Star[] = Array.from({ length: 90 }, () => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.65),
      size: 1 + Math.random() * 1.8,
      twinkleSpeed: 1.5 + Math.random() * 3,
      baseAlpha: 0.3 + Math.random() * 0.6,
    }));

    // Random weather scheduler (switches randomly between cerah, mendung, hujan, salju)
    let activeWeather: WeatherKind = pickRandomWeather();
    let nextWeatherSwitchSec = 6 + Math.random() * 5; // 6–11 seconds per weather

    // Smoothly interpolated weather intensities (0..1)
    let overcastFactor =
      activeWeather === 'mendung' || activeWeather === 'hujan' ? 1 : activeWeather === 'salju' ? 0.55 : 0;
    let rainFactor = activeWeather === 'hujan' ? 1 : 0;
    let snowFactor = activeWeather === 'salju' ? 1 : 0;

    let rafId = 0;
    let lastTime = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.08);
      lastTime = now;
      const elapsedSec = (Date.now() - SKY_START_TIME) / 1000;

      // Advance random weather when timer hits
      if (!prefersReducedMotion && elapsedSec >= nextWeatherSwitchSec) {
        activeWeather = pickRandomWeather(activeWeather);
        nextWeatherSwitchSec = elapsedSec + 6.5 + Math.random() * 5.5;
      }

      const targetOvercast =
        activeWeather === 'mendung' || activeWeather === 'hujan'
          ? 1
          : activeWeather === 'salju'
            ? 0.55
            : 0;
      const targetRain = activeWeather === 'hujan' ? 1 : 0;
      const targetSnow = activeWeather === 'salju' ? 1 : 0;

      const weatherRampSpeed = dt * 0.55; // Smooth ~1.8s transition
      overcastFactor = moveToward(overcastFactor, targetOvercast, weatherRampSpeed);
      rainFactor = moveToward(rainFactor, targetRain, weatherRampSpeed);
      snowFactor = moveToward(snowFactor, targetSnow, weatherRampSpeed);

      const timeState = getSkyTimeState(elapsedSec);
      const { morningFactor, soreFactor, nightFactor } = timeState;

      // Ambient gradient tint combining time of day + random weather
      if (tintRef.current) {
        if (nightFactor > 0.05) {
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(10, 15, 32, ${0.84 * nightFactor}), rgba(5, 8, 22, ${0.9 * nightFactor}))`;
          tintRef.current.style.opacity = String(nightFactor);
        } else if (rainFactor > 0.1 || overcastFactor > 0.45) {
          const stormStrength = Math.max(rainFactor, overcastFactor * 0.85);
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(51, 65, 85, ${0.78 * stormStrength}), rgba(30, 41, 59, ${0.85 * stormStrength}))`;
          tintRef.current.style.opacity = String(stormStrength * 0.88);
        } else if (snowFactor > 0.1) {
          // Cool crisp winter frost tint
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(148, 178, 212, ${0.52 * snowFactor}), rgba(203, 222, 240, ${0.42 * snowFactor}))`;
          tintRef.current.style.opacity = String(snowFactor);
        } else if (soreFactor > 0.05) {
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(225, 29, 72, ${0.35 * soreFactor}), rgba(245, 158, 11, ${0.45 * soreFactor}), rgba(30, 58, 138, ${0.48 * soreFactor}))`;
          tintRef.current.style.opacity = String(soreFactor);
        } else if (morningFactor > 0.05) {
          tintRef.current.style.background = `linear-gradient(to bottom, rgba(217, 119, 6, ${0.36 * morningFactor}), rgba(30, 58, 138, ${0.42 * morningFactor}))`;
          tintRef.current.style.opacity = String(morningFactor);
        } else {
          tintRef.current.style.opacity = '0';
        }
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Stars at Night (dimmed if overcast/rain/snow covers the sky)
      const clearNight = nightFactor * clamp01(1 - overcastFactor * 0.85);
      if (clearNight > 0.05) {
        ctx.save();
        ctx.globalAlpha = clearNight;
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

      // 2. Sunlight / Moon / Sunset Glow (softened during overcast/rain)
      const skyClarity = clamp01(1 - overcastFactor * 0.75);
      if (soreFactor > 0.05 && skyClarity > 0.05) {
        const sunsetGrad = ctx.createRadialGradient(
          width * 0.72,
          height * 0.55,
          10,
          width * 0.72,
          height * 0.55,
          width * 0.65
        );
        sunsetGrad.addColorStop(0, `rgba(255, 125, 45, ${0.55 * soreFactor * skyClarity})`);
        sunsetGrad.addColorStop(0.35, `rgba(244, 63, 94, ${0.35 * soreFactor * skyClarity})`);
        sunsetGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = sunsetGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (morningFactor > 0.05 && skyClarity > 0.05) {
        const sunGrad = ctx.createRadialGradient(
          width * 0.15,
          height * 0.22,
          10,
          width * 0.15,
          height * 0.22,
          width * 0.55
        );
        sunGrad.addColorStop(0, `rgba(255, 200, 87, ${0.55 * morningFactor * skyClarity})`);
        sunGrad.addColorStop(0.5, `rgba(245, 158, 11, ${0.25 * morningFactor * skyClarity})`);
        sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (nightFactor > 0.05 && skyClarity > 0.05) {
        const moonGrad = ctx.createRadialGradient(
          width * 0.85,
          height * 0.15,
          5,
          width * 0.85,
          height * 0.15,
          width * 0.35
        );
        moonGrad.addColorStop(0, `rgba(224, 242, 254, ${0.35 * nightFactor * skyClarity})`);
        moonGrad.addColorStop(1, 'rgba(224, 242, 254, 0)');
        ctx.fillStyle = moonGrad;
        ctx.fillRect(0, 0, width, height);
      } else if (skyClarity > 0.2) {
        const sunStrength = (1 - morningFactor) * (1 - soreFactor) * (1 - nightFactor) * skyClarity;
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
          beamGrad.addColorStop(0, `rgba(255, 252, 235, ${(0.24 + pulse * 0.08) * sunStrength})`);
          beamGrad.addColorStop(0.45, `rgba(224, 244, 255, ${(0.1 + pulse * 0.04) * sunStrength})`);
          beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = beamGrad;
          ctx.fillRect(0, 0, width, height);
        }
      }

      // Subtle lightning during heavy rain
      let lightningGlow = 0;
      if (rainFactor > 0.7) {
        const flashTick = (elapsedSec * 1.8) % 6.5;
        if (flashTick > 6.2 && flashTick < 6.38) {
          lightningGlow = 0.25 * rainFactor;
        }
      }

      // 3. Clouds
      for (const cloud of clouds) {
        if (!prefersReducedMotion) {
          const speedBoost = 1 + overcastFactor * 0.85;
          cloud.x += cloud.speed * speedBoost * dt;
          if (cloud.x - cloud.width * 0.65 > width) {
            cloud.x = -cloud.width * 0.65;
          }
        }

        const cy = height * cloud.yRatio;
        let rCenter = 255;
        let gCenter = 255;
        let bCenter = 255;
        let rEdge = 240;
        let gEdge = 249;
        let bEdge = 255;

        if (snowFactor > 0.2 && rainFactor < 0.3) {
          // Bright cool wintry clouds during snow
          rCenter = Math.round(240 + lightningGlow * 80);
          gCenter = Math.round(246 + lightningGlow * 80);
          bCenter = 255;
          rEdge = 205;
          gEdge = 224;
          bEdge = 245;
        } else if (overcastFactor > 0.05) {
          rCenter = Math.round(255 - overcastFactor * 182 + lightningGlow * 180);
          gCenter = Math.round(255 - overcastFactor * 168 + lightningGlow * 180);
          bCenter = Math.round(255 - overcastFactor * 145 + lightningGlow * 200);
          rEdge = Math.round(240 - overcastFactor * 192);
          gEdge = Math.round(249 - overcastFactor * 190);
          bEdge = Math.round(255 - overcastFactor * 176);
        } else if (soreFactor > 0.05) {
          rCenter = 255;
          gCenter = Math.round(255 - soreFactor * 55);
          bCenter = Math.round(255 - soreFactor * 95);
          rEdge = 255;
          gEdge = Math.round(240 - soreFactor * 80);
          bEdge = Math.round(220 - soreFactor * 130);
        } else if (nightFactor > 0.05) {
          rCenter = Math.round(255 - nightFactor * 180);
          gCenter = Math.round(255 - nightFactor * 170);
          bCenter = Math.round(255 - nightFactor * 145);
          rEdge = Math.round(240 - nightFactor * 190);
          gEdge = Math.round(249 - nightFactor * 190);
          bEdge = Math.round(255 - nightFactor * 175);
        }

        const baseAlpha = clamp01(
          0.22 +
            overcastFactor * 0.4 +
            snowFactor * 0.22 +
            soreFactor * 0.25 +
            nightFactor * 0.32
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

      // 4. Clearly visible Airplanes
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
            const trailAlpha = ratio * (rainFactor > 0.3 ? 0.25 : soreFactor > 0.3 ? 0.4 : 0.45);
            ctx.strokeStyle =
              soreFactor > 0.35
                ? `rgba(255, 230, 210, ${trailAlpha})`
                : `rgba(255, 255, 255, ${trailAlpha})`;
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
          rainFactor,
          snowFactor,
          nightFactor,
          soreFactor,
          beaconPhase
        );
      }

      // 5. Random Weather: Rain
      if (rainFactor > 0.04 && !prefersReducedMotion) {
        const activeDrops = Math.floor(raindrops.length * rainFactor);
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

          ctx.strokeStyle = `rgba(226, 240, 255, ${drop.alpha * rainFactor})`;
          ctx.lineWidth = drop.thickness;
          ctx.beginPath();
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + (windDx / drop.speed) * drop.len, drop.y + drop.len);
          ctx.stroke();
        }
      }

      // 6. Random Weather: Snow (Salju)
      if (snowFactor > 0.04 && !prefersReducedMotion) {
        const activeFlakes = Math.floor(snowflakes.length * snowFactor);
        for (let i = 0; i < activeFlakes; i++) {
          const flake = snowflakes[i];
          flake.y += flake.speedY * dt;
          const sway =
            Math.sin(elapsedSec * flake.driftFreq + flake.phase) *
            flake.driftAmp *
            dt;
          flake.x += sway - 10 * dt;

          if (flake.y > height + 15) {
            flake.y = -15;
            flake.x = Math.random() * (width + 80);
          }
          if (flake.x < -20) {
            flake.x = width + 20;
          } else if (flake.x > width + 20) {
            flake.x = -20;
          }

          const flakeGrad = ctx.createRadialGradient(
            flake.x,
            flake.y,
            0,
            flake.x,
            flake.y,
            flake.radius
          );
          const alpha = flake.alpha * snowFactor;
          flakeGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
          flakeGrad.addColorStop(0.6, `rgba(240, 248, 255, ${alpha * 0.7})`);
          flakeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

          ctx.fillStyle = flakeGrad;
          ctx.beginPath();
          ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
          ctx.fill();
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
        className="absolute inset-0"
      />

      {/* Canvas for Clouds, Planes, Stars, Rain & Snow */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-sky-900/15 via-transparent to-sky-950/20" />
    </div>
  );
}
