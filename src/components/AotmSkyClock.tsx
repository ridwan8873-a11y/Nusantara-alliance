import { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import {
  getRealWibTime,
  getSkyWeatherState,
  SKY_START_TIME,
  type SkyPhase,
} from '../lib/skyTime';

export function AotmSkyClock() {
  const [showRealWib, setShowRealWib] = useState(false);
  const [skyTime, setSkyTime] = useState(() =>
    getSkyWeatherState((Date.now() - SKY_START_TIME) / 1000)
  );
  const [realWib, setRealWib] = useState(getRealWibTime);

  useEffect(() => {
    // Ticks smoothly every 250ms for live digital clock & sky matching
    const interval = window.setInterval(() => {
      const elapsedSec = (Date.now() - SKY_START_TIME) / 1000;
      setSkyTime(getSkyWeatherState(elapsedSec));
      setRealWib(getRealWibTime());
    }, 250);

    return () => window.clearInterval(interval);
  }, []);

  const getPhaseBadgeColor = (phase: SkyPhase | string) => {
    switch (phase) {
      case 'Hujan':
        return 'border-sky-400/40 bg-sky-950/70 text-sky-300';
      case 'Pagi':
        return 'border-amber-400/40 bg-amber-950/70 text-amber-300';
      case 'Siang':
        return 'border-yellow-400/40 bg-yellow-950/60 text-yellow-300';
      case 'Sore':
        return 'border-rose-400/40 bg-rose-950/70 text-rose-300';
      case 'Malam':
        return 'border-indigo-400/40 bg-indigo-950/70 text-indigo-300';
      default:
        return 'border-white/20 bg-black/40 text-white';
    }
  };

  const activeTime = showRealWib ? realWib.timeString : skyTime.timeString;
  const activePeriod = showRealWib ? realWib.period : skyTime.label;
  const activeIcon = showRealWib ? realWib.icon : skyTime.icon;

  return (
    <button
      type="button"
      onClick={() => setShowRealWib((prev) => !prev)}
      title={
        showRealWib
          ? 'Mode: Waktu Nyata WIB (Klik untuk beralih ke Simulasi Langit)'
          : 'Mode: Waktu Simulasi Langit (Klik untuk beralih ke Waktu Nyata WIB)'
      }
      className="group relative flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-[#0A1A2F]/85 px-2.5 py-1 text-xs shadow-md backdrop-blur-md transition-all hover:border-[#D4AF37]/60 hover:bg-[#0D2442] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
    >
      <Clock className="h-3.5 w-3.5 text-[#E5C158] transition-transform duration-300 group-hover:rotate-45" />

      {/* Clock Display */}
      <span className="font-mono text-[11px] font-bold tracking-tight text-white tabular-nums sm:text-xs">
        {activeTime}
      </span>

      {/* Weather/Time Period Pill */}
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.2 text-[10px] font-semibold transition-colors duration-300 ${getPhaseBadgeColor(
          activePeriod
        )}`}
      >
        <span>{activeIcon}</span>
        <span>{activePeriod}</span>
      </span>

      {/* Quick toggle indicator */}
      <span className="hidden items-center text-[9px] font-medium text-slate-400 transition-colors group-hover:text-amber-200 lg:inline-flex">
        {showRealWib ? '(WIB)' : '(Langit)'}
        <RefreshCw className="ml-1 h-2.5 w-2.5 opacity-50 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  );
}
