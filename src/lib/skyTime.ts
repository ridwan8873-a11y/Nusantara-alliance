export type SkyPhase = 'Hujan' | 'Pagi' | 'Siang' | 'Sore' | 'Malam';

export interface SkyWeatherState {
  phase: SkyPhase;
  label: string;
  icon: string;
  hour: number;
  minute: number;
  timeString: string;
  storm: number; // 0 to 1
  morningFactor: number; // 0 to 1
  soreFactor: number; // 0 to 1
  nightFactor: number; // 0 to 1
  dayFactor: number; // 0 to 1
}

// Global start timestamp so all components stay 100% in sync
export const SKY_START_TIME = Date.now();

// Fast continuous 40-second cycle:
// 0s - 8s (8s): 🌧️ Hujan & Mendung (Initial entry greeting! Jam 03:30 - 05:30)
// 8s - 16s (8s): 🌅 Pagi (Golden sunrise, Jam 05:30 - 10:30)
// 16s - 24s (8s): ☀️ Siang (Bright daylight, Jam 10:30 - 15:30)
// 24s - 32s (8s): 🌇 Sore (Sunset dusk amber glow, Jam 15:30 - 18:45)
// 32s - 40s (8s): 🌙 Malam (Starry night, Jam 18:45 - 03:30)
export const CYCLE_DURATION_SEC = 40;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function getSkyWeatherState(elapsedSec: number): SkyWeatherState {
  const cycle = elapsedSec % CYCLE_DURATION_SEC;

  let phase: SkyPhase = 'Hujan';
  let label = 'Hujan';
  let icon = '🌧️';
  let currentHourDecimal = 4.0;
  let storm = 0;
  let morningFactor = 0;
  let soreFactor = 0;
  let nightFactor = 0;
  let dayFactor = 0;

  if (cycle < 8) {
    // 1. Hujan & Mendung (Jam 03:30 - 05:30)
    const p = cycle / 8;
    currentHourDecimal = 3.5 + p * 2.0;
    phase = 'Hujan';
    label = 'Hujan';
    icon = '🌧️';
    storm = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
    morningFactor = p > 0.75 ? (p - 0.75) / 0.25 : 0;
    nightFactor = p < 0.25 ? (1 - p / 0.25) * 0.4 : 0;
  } else if (cycle < 16) {
    // 2. Pagi (Jam 05:30 - 10:30)
    const p = (cycle - 8) / 8;
    currentHourDecimal = 5.5 + p * 5.0;
    phase = 'Pagi';
    label = 'Pagi';
    icon = '🌅';
    storm = 0;
    morningFactor = p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
    dayFactor = p > 0.5 ? (p - 0.5) / 0.5 : 0;
  } else if (cycle < 24) {
    // 3. Siang (Jam 10:30 - 15:30)
    const p = (cycle - 16) / 8;
    currentHourDecimal = 10.5 + p * 5.0;
    phase = 'Siang';
    label = 'Siang';
    icon = '☀️';
    storm = 0;
    morningFactor = 0;
    dayFactor = 1;
    soreFactor = p > 0.75 ? (p - 0.75) / 0.25 : 0;
  } else if (cycle < 32) {
    // 4. Sore (Jam 15:30 - 18:45)
    const p = (cycle - 24) / 8;
    currentHourDecimal = 15.5 + p * 3.25;
    phase = 'Sore';
    label = 'Sore';
    icon = '🌇';
    storm = 0;
    soreFactor = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    nightFactor = p > 0.55 ? (p - 0.55) / 0.45 : 0;
  } else {
    // 5. Malam (Jam 18:45 - 03:30)
    const p = (cycle - 32) / 8;
    currentHourDecimal = (18.75 + p * 8.75) % 24;
    phase = 'Malam';
    label = 'Malam';
    icon = '🌙';
    nightFactor = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
    storm = p > 0.82 ? (p - 0.82) / 0.18 : 0;
  }

  const hour = Math.floor(currentHourDecimal);
  const minute = Math.floor((currentHourDecimal - hour) * 60);
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    phase,
    label,
    icon,
    hour,
    minute,
    timeString,
    storm,
    morningFactor,
    soreFactor,
    nightFactor,
    dayFactor,
  };
}

export function getRealWibTime(): {
  timeString: string;
  period: 'Pagi' | 'Siang' | 'Sore' | 'Malam';
  icon: string;
} {
  const now = new Date();
  // Format to Asia/Jakarta (WIB)
  const jakartaStr = now.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  const [hStr, mStr] = jakartaStr.split(':');
  const h = parseInt(hStr || '0', 10);
  const m = parseInt(mStr || '0', 10);
  const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} WIB`;

  let period: 'Pagi' | 'Siang' | 'Sore' | 'Malam' = 'Siang';
  let icon = '☀️';

  if (h >= 5 && h < 11) {
    period = 'Pagi';
    icon = '🌅';
  } else if (h >= 11 && h < 15) {
    period = 'Siang';
    icon = '☀️';
  } else if (h >= 15 && h < 18) {
    period = 'Sore';
    icon = '🌇';
  } else {
    period = 'Malam';
    icon = '🌙';
  }

  return { timeString, period, icon };
}
