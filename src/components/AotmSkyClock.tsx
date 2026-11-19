import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import {
  getRealWibTime,
  getSkyWeatherState,
  SKY_START_TIME,
} from '../lib/skyTime';

export function AotmSkyClock() {
  const [showRealWib, setShowRealWib] = useState(false);
  const [skyTime, setSkyTime] = useState(() =>
    getSkyWeatherState((Date.now() - SKY_START_TIME) / 1000)
  );
  const [realWib, setRealWib] = useState(getRealWibTime);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const elapsedSec = (Date.now() - SKY_START_TIME) / 1000;
      setSkyTime(getSkyWeatherState(elapsedSec));
      setRealWib(getRealWibTime());
    }, 250);

    return () => window.clearInterval(interval);
  }, []);

  const activeTime = showRealWib ? realWib.timeString : skyTime.timeString;

  return (
    <button
      type="button"
      onClick={() => setShowRealWib((prev) => !prev)}
      title={
        showRealWib
          ? 'Jam Waktu Nyata (WIB) · Klik untuk beralih ke Jam Siklus Langit'
          : 'Jam Siklus Langit · Klik untuk beralih ke Jam Waktu Nyata (WIB)'
      }
      className="group flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-[#0A1A2F]/85 px-2.5 py-1 text-xs shadow-md backdrop-blur-md transition-all hover:border-[#D4AF37]/60 hover:bg-[#0D2442] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
    >
      <Clock className="h-3.5 w-3.5 text-[#E5C158] transition-transform duration-300 group-hover:rotate-45" />
      <span className="font-mono text-xs font-bold tracking-tight text-white tabular-nums sm:text-sm">
        {activeTime}
      </span>
    </button>
  );
}
