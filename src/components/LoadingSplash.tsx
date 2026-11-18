import { useEffect, useState } from 'react';
import { LogIn, Plane } from 'lucide-react';
import skyBackdropImg from '../assets/images/aotm_moonlight_sky_1794920814104.jpg';
import { MOON_EVENT_OPEN_DATE_LABEL } from '../types/moonEvent';
import type { User } from 'firebase/auth';

interface LoadingSplashProps {
  onComplete: () => void;
  user: User | null;
  authBusy: boolean;
  onGoogleSignIn: () => Promise<void>;
}

export function LoadingSplash({
  onComplete,
  user,
  authBusy,
  onGoogleSignIn,
}: LoadingSplashProps) {
  const [exiting, setExiting] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [bgError, setBgError] = useState(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const holdMs = prefersReducedMotion ? 300 : 1000;
    const fadeMs = prefersReducedMotion ? 150 : 250;

    const exitTimer = window.setTimeout(() => {
      setExiting(true);
    }, holdMs);

    const doneTimer = window.setTimeout(() => {
      onComplete();
    }, holdMs + fadeMs);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      role="status"
      aria-label="Memuat Portal AOTM Nusantara Alliance"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#080E18] px-6 transition-opacity duration-250 ${
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* Subtle Atmospheric Backdrop */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {!bgError && (
          <img
            src={skyBackdropImg}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setBgError(true)}
            className="h-full w-full object-cover object-center opacity-20"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#080E18]/80 via-[#080E18]/90 to-[#080E18]" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* Clean Framed Alliance Emblem */}
        <div className="h-16 w-16 overflow-hidden rounded-lg border border-white/20 bg-black sm:h-20 sm:w-20">
          {!logoError ? (
            <img
              src="/assets/alliance-emblem.jpg"
              alt="Logo Nusantara Alliance"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#D4AF37]">
              <Plane className="h-8 w-8" />
            </div>
          )}
        </div>

        <p className="mt-6 text-xs font-medium tracking-wide text-[#D4AF37]">
          Nusantara Alliance · Edisi November 2026
        </p>

        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl text-balance">
          AOTM Nusantara Alliance
        </h1>

        <p className="mt-2.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
          Kompetisi resmi laporan performa finansial dan armada maskapai.
          Pengumpulan dibuka {MOON_EVENT_OPEN_DATE_LABEL}.
        </p>

        {/* Hairline Progress Bar */}
        <div className="mt-7 h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-white/15">
          <div className="aotm-splash-bar h-full w-full bg-[#D4AF37]" />
        </div>

        <div className="mt-6 flex flex-col gap-2.5 w-full max-w-xs">
          {!user ? (
            <button
              type="button"
              disabled={authBusy}
              onClick={async () => {
                try {
                  await onGoogleSignIn();
                  setExiting(true);
                  window.setTimeout(onComplete, 180);
                } catch {
                  // Fallback to portal enter if cancelled
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-xs font-semibold text-[#080E18] transition-colors hover:bg-[#E5C158] disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" />
              {authBusy ? 'Menghubungkan...' : 'Login dengan Google untuk Masuk'}
            </button>
          ) : (
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300">
              Masuk sebagai {user.email}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setExiting(true);
              window.setTimeout(onComplete, 180);
            }}
            className="rounded-lg border border-white/15 bg-[#0D1524] px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            Lanjutkan ke Portal
          </button>
        </div>
      </div>
    </div>
  );
}
