import { Trophy } from 'lucide-react';
import type { OnlinePresenceState } from '../hooks/useOnlinePresence';
import { AotmSkyClock } from './AotmSkyClock';
import { OnlineEyeButton } from './OnlineEyeButton';

const WHATSAPP_GROUP_URL =
  'https://chat.whatsapp.com/LFd7a7HAYIrGBCq8uFT2tw?s=cl&p=a&mlu=4&ilr=4';

interface NavbarProps {
  isEventVisible?: boolean;
  isAdmin?: boolean;
  presence?: OnlinePresenceState;
  currentUid?: string | null;
  isVerifiedUser?: boolean;
  authBusy?: boolean;
  onGoogleSignIn?: () => Promise<void>;
}

export function Navbar({
  isEventVisible = true,
  isAdmin = false,
  presence,
  currentUid,
  isVerifiedUser = false,
  authBusy = false,
  onGoogleSignIn,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/20 bg-[#0C2D48]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:gap-8 sm:px-6 sm:py-3.5 lg:px-8">
        {/* Zone 1: Clean Single-Line Brand Wordmark + Live Sky Time Clock */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <a
            href="#airlines-of-the-moon"
            className="flex min-w-0 shrink items-center gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D4AF37] sm:gap-3"
          >
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded border border-white/20 bg-black sm:h-8 sm:w-8">
              <img
                src="/assets/alliance-emblem.jpg"
                alt="Nusantara Alliance"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
            <span className="truncate font-display text-sm font-semibold tracking-tight text-white sm:text-base">
              AOTM Nusantara Alliance
            </span>
          </a>

          {/* Clock beside AOTM title */}
          <AotmSkyClock />
        </div>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav
          aria-label="Navigasi Halaman AOTM"
          className="hidden items-center gap-6 md:flex"
        >
          <a
            href="#airlines-of-the-moon"
            className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline underline-offset-4"
          >
            Kompetisi
          </a>
          <a
            href="#kriteria-penilaian"
            className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline underline-offset-4"
          >
            Kriteria Juri
          </a>
          {isEventVisible && (
            <a
              href="#laporan-maskapai-aotm"
              className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline underline-offset-4"
            >
              Formulir Laporan
            </a>
          )}
          <a
            href={WHATSAPP_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-slate-300 whitespace-nowrap shrink-0 transition-colors hover:text-white hover:underline underline-offset-4"
          >
            Grup Aliansi
          </a>
        </nav>

        {/* Zone 3: Top-Right Eye Monitor & Primary Action */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {isAdmin && presence && onGoogleSignIn && (
            <OnlineEyeButton
              compact
              presence={presence}
              currentUid={currentUid}
              isVerifiedUser={isVerifiedUser}
              authBusy={authBusy}
              onGoogleSignIn={onGoogleSignIn}
            />
          )}
          <a
            href="#laporan-maskapai-aotm"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] px-2.5 py-1.5 text-[11px] font-semibold text-[#080E18] whitespace-nowrap shrink-0 transition-colors duration-150 hover:bg-[#E5C158] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] sm:gap-2 sm:px-4 sm:py-2 sm:text-xs"
          >
            <Trophy className="h-3.5 w-3.5" />
            <span>Kirim Laporan</span>
          </a>
        </div>
      </div>
    </header>
  );
}
