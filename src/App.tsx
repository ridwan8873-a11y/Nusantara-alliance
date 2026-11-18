import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  ExternalLink,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import skyBackdropImg from './assets/images/aotm_moonlight_sky_1794920814104.jpg';
import { AirlinesOfTheMoonSection } from './components/AirlinesOfTheMoonSection';
import { LoadingSplash } from './components/LoadingSplash';
import { Navbar } from './components/Navbar';
import { useOnlinePresence } from './hooks/useOnlinePresence';
import { ADMIN_EMAIL, auth, signInWithGoogle } from './lib/firebase';

const WHATSAPP_GROUP_URL =
  'https://chat.whatsapp.com/LFd7a7HAYIrGBCq8uFT2tw?s=cl&p=a&mlu=4&ilr=4';
const WHATSAPP_HELP_URL =
  'https://wa.me/6283822338448?text=Halo%20Admin%20Nusantara%20Alliance,%20saya%20butuh%20bantuan%20terkait%20AOTM%20Nusantara%20Alliance';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [bgError, setBgError] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const isVerifiedUser = Boolean(user && user.emailVerified);
  const isAdmin = Boolean(
    isVerifiedUser &&
      user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // Popup closed or blocked
    } finally {
      setAuthBusy(false);
    }
  };

  const presence = useOnlinePresence(user, isVerifiedUser, isAdmin);

  const handleAdminFooterLogin = async () => {
    if (isAdmin) {
      document
        .getElementById('brankas-admin')
        ?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    try {
      await signInWithGoogle();
      document
        .getElementById('airlines-of-the-moon')
        ?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      // Handled inside event section
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#080E18] text-slate-100">
      {showSplash && (
        <LoadingSplash
          onComplete={handleSplashComplete}
          user={user}
          authBusy={authBusy}
          onGoogleSignIn={handleGoogleSignIn}
        />
      )}

      {/* Subtle Atmospheric Sky Backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {!bgError && (
          <img
            src={skyBackdropImg}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setBgError(true)}
            className="h-full w-full object-cover object-center opacity-25"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#080E18]/75 via-[#080E18]/90 to-[#080E18]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col justify-between">
        <Navbar
          isEventVisible={true}
          isAdmin={isAdmin}
          presence={presence}
          currentUid={user?.uid}
          isVerifiedUser={isVerifiedUser}
          authBusy={authBusy}
          onGoogleSignIn={handleGoogleSignIn}
        />

        <main className="mx-auto w-full max-w-6xl space-y-12 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          {/* Main Focus: AOTM Nusantara Alliance Official Championship */}
          <AirlinesOfTheMoonSection
            user={user}
            authReady={authReady}
          />
        </main>

        <footer className="border-t border-white/10 bg-[#080E18]">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 pt-6 pb-20 sm:flex-row sm:items-center sm:px-6 sm:pb-16 lg:px-8">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400">
              <span className="font-display text-sm font-semibold tracking-tight text-slate-100">
                AOTM Nusantara Alliance
              </span>
              <span aria-hidden="true" className="text-white/20">
                ·
              </span>
              <span>© 2026 Nusantara Alliance</span>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={handleAdminFooterLogin}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white whitespace-nowrap"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-[#D4AF37]" />
                {isAdmin ? 'Buka Brankas Admin' : 'Login Brankas Admin'}
              </button>

              <a
                href={WHATSAPP_HELP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-emerald-300 hover:underline underline-offset-4 whitespace-nowrap"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
                Butuh Bantuan? Chat 6283822338448
              </a>

              <a
                href={WHATSAPP_GROUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E5C158] transition-colors hover:text-[#FFE043] hover:underline underline-offset-4 whitespace-nowrap"
              >
                Grup WhatsApp Resmi
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </footer>
      </div>

      {/* Floating Quick WhatsApp Help Button (Bottom Right Corner) */}
      <a
        href={WHATSAPP_HELP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Butuh Bantuan? Chat nomor 6283822338448"
        className="fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-lg border border-white/15 bg-[#0D1524]/95 px-3 py-2 text-[11px] font-medium text-slate-200 shadow-lg backdrop-blur-md transition-colors duration-150 hover:border-emerald-400/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 whitespace-nowrap sm:bottom-5 sm:right-5 sm:px-3.5 sm:py-2 sm:text-xs"
      >
        <MessageCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0 sm:h-4 sm:w-4" />
        <span>Butuh Bantuan? Chat nomor 6283822338448</span>
      </a>
    </div>
  );
}
