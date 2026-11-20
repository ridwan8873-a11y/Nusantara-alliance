export type SkyPeriod = 'Pagi' | 'Siang' | 'Sore' | 'Malam';
export type WeatherKind = 'cerah' | 'mendung' | 'hujan' | 'salju';

export interface SkyTimeState {
  period: SkyPeriod;
  hour: number;
  minute: number;
  timeString: string;
  morningFactor: number; // 0 to 1
  dayFactor: number; // 0 to 1
  soreFactor: number; // 0 to 1
  nightFactor: number; // 0 to 1
}

// Global start timestamp so all components stay synchronized
export const SKY_START_TIME = Date.now();

// Fast continuous 32-second 24-hour cycle (starts around 05:30 sunrise)
export const DAY_CYCLE_DURATION_SEC = 32;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getSkyTimeState(elapsedSec: number): SkyTimeState {
  const cycleProgress = (elapsedSec % DAY_CYCLE_DURATION_SEC) / DAY_CYCLE_DURATION_SEC;
  // Start at 05:30 (5.5h) so visitors experience dawn -> day -> dusk -> night smoothly
  const hourDecimal = (5.5 + cycleProgress * 24) % 24;

  const hour = Math.floor(hourDecimal);
  const minute = Math.floor((hourDecimal - hour) * 60);
  const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  // Smooth lighting weights across 24 hours
  let morningFactor = 0;
  let dayFactor = 0;
  let soreFactor = 0;
  let nightFactor = 0;
  let period: SkyPeriod = 'Siang';

  if (hourDecimal >= 5 && hourDecimal < 9.5) {
    period = 'Pagi';
    if (hourDecimal < 7.5) {
      morningFactor = smoothstep(4.5, 6.2, hourDecimal);
      nightFactor = 1 - smoothstep(5.0, 6.5, hourDecimal);
    } else {
      morningFactor = 1 - smoothstep(7.5, 9.5, hourDecimal);
      dayFactor = smoothstep(7.5, 9.5, hourDecimal);
    }
  } else if (hourDecimal >= 9.5 && hourDecimal < 15.5) {
    period = 'Siang';
    dayFactor = 1;
  } else if (hourDecimal >= 15.5 && hourDecimal < 19.0) {
    period = 'Sore';
    if (hourDecimal < 17.5) {
      dayFactor = 1 - smoothstep(15.5, 17.2, hourDecimal);
      soreFactor = smoothstep(15.5, 17.2, hourDecimal);
    } else {
      soreFactor = 1 - smoothstep(17.5, 19.0, hourDecimal);
      nightFactor = smoothstep(17.4, 19.0, hourDecimal);
    }
  } else {
    period = 'Malam';
    if (hourDecimal >= 4.0 && hourDecimal < 5.0) {
      nightFactor = 1 - smoothstep(4.2, 5.0, hourDecimal) * 0.4;
      morningFactor = smoothstep(4.3, 5.0, hourDecimal) * 0.4;
    } else {
      nightFactor = 1;
    }
  }

  return {
    period,
    hour,
    minute,
    timeString,
    morningFactor,
    dayFactor,
    soreFactor,
    nightFactor,
  };
}

export function pickRandomWeather(previous?: WeatherKind): WeatherKind {
  const options: WeatherKind[] = ['cerah', 'mendung', 'hujan', 'salju'];
  const pool = previous ? options.filter((w) => w !== previous) : options;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getRealWibTime(): {
  timeString: string;
} {
  const now = new Date();
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

  return { timeString };
}
