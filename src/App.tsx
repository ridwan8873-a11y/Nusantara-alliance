import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { AirlinesOfTheMoonSection } from './components/AirlinesOfTheMoonSection';
import { AotmMusicPlayer } from './components/AotmMusicPlayer';
import { LoadingSplash } from './components/LoadingSplash';
import { Navbar } from './components/Navbar';
import { SkyMotionBackdrop } from './components/SkyMotionBackdrop';
import { useOnlinePresence } from './hooks/useOnlinePresence';
import { ADMIN_EMAIL, auth, signInWithGoogle } from './lib/firebase';

const WHATSAPP_GROUP_URL =
  'https://chat.whatsapp.com/LFd7a7HAYIrGBCq8uFT2tw?s=cl&p=a&mlu=4&ilr=4';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

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
    <div className="relative min-h-screen overflow-x-hidden bg-sky-200 text-slate-900">
      {showSplash && (
        <LoadingSplash
          onComplete={handleSplashComplete}
          user={user}
          authBusy={authBusy}
          onGoogleSignIn={handleGoogleSignIn}
        />
      )}

      {/* Live Animated Bright Sky & Aviation Flight Backdrop */}
      <SkyMotionBackdrop />

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

        <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <AotmMusicPlayer />
          {/* Main Focus: AOTM Nusantara Alliance Official Championship */}
          <AirlinesOfTheMoonSection
            user={user}
            authReady={authReady}
          />
        </main>

        <footer className="border-t border-white/20 bg-[#0C2D48]/85 text-slate-100 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-6 sm:flex-row sm:items-center sm:px-6 lg:px-8">
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
    </div>
  );
}
