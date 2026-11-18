import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  LogIn,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { OnlinePresenceState } from '../hooks/useOnlinePresence';

interface OnlineEyeButtonProps {
  presence: OnlinePresenceState;
  currentUid?: string | null;
  isVerifiedUser: boolean;
  authBusy: boolean;
  onGoogleSignIn: () => Promise<void>;
  compact?: boolean;
}

function formatLastActive(lastSeenAt: { toMillis?: () => number } | null): string {
  if (!lastSeenAt || typeof lastSeenAt.toMillis !== 'function') {
    return 'Aktif sekarang';
  }
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - lastSeenAt.toMillis()) / 1000)
  );
  if (diffSec < 25) return 'Aktif sekarang';
  return `Aktif ${diffSec} dtk lalu`;
}

export function OnlineEyeButton({
  presence,
  currentUid,
  isVerifiedUser,
  authBusy,
  onGoogleSignIn,
  compact = false,
}: OnlineEyeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lihat siapa yang sedang online (${presence.totalOnline} orang)`}
        className={`inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#0D1524] font-medium text-slate-200 whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/30 hover:bg-[#131F33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] ${
          compact ? 'px-2.5 py-1.5 text-[11px] sm:gap-2 sm:px-3 sm:text-xs' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Eye className="h-3.5 w-3.5 text-emerald-400 sm:h-4 sm:w-4" />
        <span className="font-mono tabular-nums text-white">{presence.totalOnline}</span>
        <span className={compact ? 'hidden sm:inline text-slate-400' : 'text-slate-400'}>Online</span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Daftar Pengunjung Asli Online"
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/15 bg-[#0D1524] shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#080E18] px-6 py-5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                    <Eye className="h-4 w-4" />
                    <span>Pemantau Kehadiran Real-Time</span>
                  </div>
                  <h3 className="mt-1 font-display text-xl font-semibold text-white">
                    Pengguna Sedang Online ({presence.totalOnline})
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Menampilkan pengunjung asli yang sedang aktif membuka website
                    AOTM Nusantara Alliance saat ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup pemantau online"
                  className="rounded-md border border-white/15 bg-[#0D1524] p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-2 divide-x divide-white/10 border-b border-white/10 bg-[#080E18]">
                <div className="px-6 py-4">
                  <p className="text-[11px] font-medium text-slate-400">
                    Akun Google Terlogin
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                    {presence.onlineUsers.length}
                  </p>
                </div>
                <div className="px-6 py-4">
                  <p className="text-[11px] font-medium text-slate-400">
                    Pengunjung Tamu
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-slate-200 tabular-nums">
                    {presence.guestCount}
                  </p>
                </div>
              </div>

              {/* Real Online Users List */}
              <div className="max-h-[340px] space-y-2 overflow-y-auto px-6 py-4">
                {presence.onlineUsers.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-[#080E18] px-4 py-6 text-center">
                    <Users className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-xs font-medium text-slate-200">
                      Belum ada pengguna terlogin Google yang tampil di daftar.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Saat ini terdapat{' '}
                      <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                        {presence.guestCount}
                      </span>{' '}
                      pengunjung asli yang sedang membuka halaman ini.
                    </p>
                  </div>
                ) : (
                  presence.onlineUsers.map((person) => {
                    const isSelf = currentUid === person.uid;
                    const isPersonAdmin = person.role === 'admin';
                    const initials = person.displayName
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        key={person.uid}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 ${
                          isPersonAdmin
                            ? 'border-[#D4AF37]/40 bg-[#141722]'
                            : 'border-white/10 bg-[#080E18]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {person.avatarUrl ? (
                            <img
                              src={person.avatarUrl}
                              alt={person.displayName}
                              referrerPolicy="no-referrer"
                              className="h-9 w-9 shrink-0 rounded-full border border-white/20 object-cover"
                            />
                          ) : (
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                isPersonAdmin
                                  ? 'bg-[#D4AF37] text-[#080E18]'
                                  : 'bg-[#1A263C] text-slate-200'
                              }`}
                            >
                              {initials}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isPersonAdmin && (
                                <span className="inline-flex items-center gap-1 rounded bg-[#D4AF37] px-1.5 py-0.5 text-[10px] font-bold text-[#080E18] uppercase">
                                  <ShieldCheck className="h-3 w-3" />
                                  ADMIN
                                </span>
                              )}
                              <p className="truncate text-sm font-semibold text-white">
                                {person.displayName}
                              </p>
                              {isSelf && (
                                <span className="text-[11px] font-medium text-emerald-400">
                                  (Anda)
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {isPersonAdmin ? 'Owner / Juri' : 'Anggota Terverifikasi'}{' '}
                              · {formatLastActive(person.lastSeenAt)}
                            </p>
                          </div>
                        </div>

                        <UserCheck
                          className={`h-4 w-4 shrink-0 ${
                            isPersonAdmin ? 'text-[#D4AF37]' : 'text-emerald-400'
                          }`}
                        />
                      </div>
                    );
                  })
                )}

                {presence.guestCount > 0 && presence.onlineUsers.length > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#080E18] px-3.5 py-2.5 text-xs">
                    <span className="text-slate-300">
                      Pengunjung Tamu (Belum Login Google)
                    </span>
                    <span className="font-mono font-semibold text-[#D4AF37] tabular-nums">
                      +{presence.guestCount} orang
                    </span>
                  </div>
                )}
              </div>

              {/* Footer / Sign-in invite if guest */}
              <div className="flex flex-col justify-between gap-3 border-t border-white/10 bg-[#080E18] px-6 py-4 sm:flex-row sm:items-center">
                {!isVerifiedUser ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Login Google agar nama asli Anda tampil di daftar online.
                    </p>
                    <button
                      type="button"
                      disabled={authBusy}
                      onClick={onGoogleSignIn}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#D4AF37] px-3.5 py-2 text-xs font-semibold text-[#080E18] transition-colors hover:bg-[#E5C158] disabled:opacity-60"
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      {authBusy ? 'Menghubungkan...' : 'Login Google'}
                    </button>
                  </>
                ) : (
                  <p className="text-[11px] text-emerald-400">
                    Kehadiran Anda tercatat real-time sebagai pengguna terverifikasi.
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
