import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Eye,
  Globe,
  History,
  LogIn,
  Monitor,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { OnlinePresenceState } from '../hooks/useOnlinePresence';
import type { SiteVisitorRecord } from '../types/moonEvent';

interface OnlineEyeButtonProps {
  presence: OnlinePresenceState;
  currentUid?: string | null;
  isVerifiedUser: boolean;
  authBusy: boolean;
  onGoogleSignIn: () => Promise<void>;
  compact?: boolean;
}

function isVisitorCurrentlyOnline(
  visitor: SiteVisitorRecord,
  nowMs: number
): boolean {
  if (!visitor.isOnline) return false;
  if (!visitor.lastSeenAt || typeof visitor.lastSeenAt.toMillis !== 'function') {
    return true;
  }
  return nowMs - visitor.lastSeenAt.toMillis() <= 75_000;
}

function formatLastActive(
  lastSeenAt: { toMillis?: () => number } | null,
  onlineNow: boolean
): string {
  if (!lastSeenAt || typeof lastSeenAt.toMillis !== 'function') {
    return onlineNow ? 'Aktif sekarang' : 'Baru saja';
  }
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - lastSeenAt.toMillis()) / 1000)
  );
  if (onlineNow && diffSec < 25) return 'Aktif sekarang';
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} hari lalu`;
}

function formatWibDateTime(ts: { toDate?: () => Date } | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Baru saja';
  try {
    return (
      new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(ts.toDate()) + ' WIB'
    );
  } catch {
    return '-';
  }
}

function isMobileDevice(deviceLabel: string): boolean {
  return /android|iphone|ipad/i.test(deviceLabel);
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
  const [activeTab, setActiveTab] = useState<'online' | 'history'>('online');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'google' | 'guest'>(
    'all'
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const nowMs = Date.now();

  const sourceList =
    activeTab === 'online' ? presence.onlineVisitors : presence.allVisitors;

  const filteredVisitors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sourceList.filter((item) => {
      if (typeFilter === 'google' && item.visitorType === 'guest') return false;
      if (typeFilter === 'guest' && item.visitorType !== 'guest') return false;
      if (!q) return true;
      return (
        item.displayName.toLowerCase().includes(q) ||
        (item.email && item.email.toLowerCase().includes(q)) ||
        item.deviceLabel.toLowerCase().includes(q) ||
        item.browserLabel.toLowerCase().includes(q)
      );
    });
  }, [sourceList, searchQuery, typeFilter]);

  const handleDeleteVisitor = async (visitorId: string) => {
    setDeletingId(visitorId);
    try {
      await presence.deleteVisitor(visitorId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lihat pengunjung online (${presence.totalOnline}) dan riwayat masuk (${presence.totalRecordedVisitors})`}
        title={`Sedang online: ${presence.totalOnline} · Total masuk tercatat: ${presence.totalRecordedVisitors}`}
        className={`inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-[#0D1524] font-medium text-slate-200 whitespace-nowrap shrink-0 transition-colors duration-150 hover:border-white/30 hover:bg-[#131F33] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] ${
          compact
            ? 'px-2.5 py-1.5 text-[11px] sm:gap-2 sm:px-3 sm:text-xs'
            : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Eye className="h-3.5 w-3.5 text-emerald-400 sm:h-4 sm:w-4" />
        <span className="font-mono tabular-nums text-white">
          {presence.totalOnline}
        </span>
        <span
          className={
            compact ? 'hidden sm:inline text-slate-400' : 'text-slate-400'
          }
        >
          Online
        </span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pemantau Pengunjung Website"
            className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-xl overflow-hidden rounded-xl border border-white/15 bg-[#0D1524] shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[#080E18] px-6 py-5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                    <Eye className="h-4 w-4" />
                    <span>Pemantau Pengunjung Real-Time (Khusus Admin)</span>
                  </div>
                  <h3 className="mt-1 font-display text-xl font-semibold text-white">
                    Siapa yang Masuk Website
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    Menampilkan pengunjung aktif sekarang maupun yang sudah
                    pernah masuk (akun Google &amp; pengunjung tamu).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Tutup pemantau pengunjung"
                  className="rounded-md border border-white/15 bg-[#0D1524] p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Summary Metrics Strip */}
              <div className="grid grid-cols-3 divide-x divide-white/10 border-b border-white/10 bg-[#080E18]">
                <div className="px-4 py-3.5 sm:px-6">
                  <p className="text-[11px] font-medium text-slate-400">
                    Sedang Online
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-emerald-400 tabular-nums">
                    {presence.totalOnline}
                  </p>
                </div>
                <div className="px-4 py-3.5 sm:px-6">
                  <p className="text-[11px] font-medium text-slate-400">
                    Google / Tamu
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-white tabular-nums">
                    {presence.onlineGoogleCount}
                    <span className="text-sm font-normal text-slate-400">
                      {' '}
                      / {presence.guestCount}
                    </span>
                  </p>
                </div>
                <div className="px-4 py-3.5 sm:px-6">
                  <p className="text-[11px] font-medium text-slate-400">
                    Sudah Masuk
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-[#E5C158] tabular-nums">
                    {presence.totalRecordedVisitors}
                  </p>
                </div>
              </div>

              {/* Tabs & Filter Controls */}
              <div className="space-y-3 border-b border-white/10 bg-[#0A1322] px-6 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-lg border border-white/10 bg-[#080E18] p-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab('online')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeTab === 'online'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>Sedang Online ({presence.totalOnline})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeTab === 'history'
                          ? 'bg-[#D4AF37]/20 text-[#F7E7A9]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      <span>
                        Sudah Masuk ({presence.totalRecordedVisitors})
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 text-[11px]">
                    {(['all', 'google', 'guest'] as const).map((filterKey) => (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() => setTypeFilter(filterKey)}
                        className={`rounded-md border px-2 py-1 font-medium transition-colors ${
                          typeFilter === filterKey
                            ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#F7E7A9]'
                            : 'border-white/10 bg-[#080E18] text-slate-400 hover:text-white'
                        }`}
                      >
                        {filterKey === 'all'
                          ? 'Semua'
                          : filterKey === 'google'
                            ? 'Google'
                            : 'Tamu'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama, email Google, HP/PC, atau browser..."
                    className="w-full rounded-md border border-white/15 bg-[#080E18] py-1.5 pr-3 pl-8 text-xs text-white placeholder:text-slate-500 focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
              </div>

              {/* Visitors List */}
              <div className="max-h-[360px] space-y-2 overflow-y-auto px-6 py-4">
                {presence.loading && presence.allVisitors.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-[#080E18] px-4 py-8 text-center">
                    <p className="text-xs text-slate-300">
                      Memuat daftar pengunjung website...
                    </p>
                  </div>
                ) : filteredVisitors.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-[#080E18] px-4 py-8 text-center">
                    <Users className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-xs font-medium text-slate-200">
                      {activeTab === 'online'
                        ? 'Tidak ada pengunjung yang cocok pada tab Sedang Online.'
                        : 'Belum ada riwayat pengunjung yang tercatat.'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {activeTab === 'online' &&
                      presence.totalRecordedVisitors > 0
                        ? `Buka tab "Sudah Masuk (${presence.totalRecordedVisitors})" untuk melihat siapa saja yang pernah membuka web ini.`
                        : 'Setiap pengunjung baru (Google maupun Tamu) akan otomatis tercatat di sini.'}
                    </p>
                  </div>
                ) : (
                  filteredVisitors.map((visitor) => {
                    const isSelf =
                      Boolean(currentUid) && visitor.uid === currentUid;
                    const isPersonAdmin = visitor.visitorType === 'admin';
                    const isGoogle = visitor.visitorType !== 'guest';
                    const onlineNow = isVisitorCurrentlyOnline(visitor, nowMs);
                    const initials = visitor.displayName
                      .replace(/^Tamu #/i, 'T')
                      .slice(0, 2)
                      .toUpperCase();
                    const DeviceIcon = isMobileDevice(visitor.deviceLabel)
                      ? Smartphone
                      : Monitor;

                    return (
                      <div
                        key={visitor.visitorId}
                        className={`flex items-start justify-between gap-3 rounded-lg border px-3.5 py-3 ${
                          isPersonAdmin
                            ? 'border-[#D4AF37]/40 bg-[#141722]'
                            : onlineNow
                              ? 'border-emerald-500/30 bg-[#08121B]'
                              : 'border-white/10 bg-[#080E18]'
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          {visitor.avatarUrl ? (
                            <img
                              src={visitor.avatarUrl}
                              alt={visitor.displayName}
                              referrerPolicy="no-referrer"
                              className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-white/20 object-cover"
                            />
                          ) : (
                            <div
                              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                isPersonAdmin
                                  ? 'bg-[#D4AF37] text-[#080E18]'
                                  : isGoogle
                                    ? 'bg-[#1A263C] text-sky-200'
                                    : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {initials}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isPersonAdmin ? (
                                <span className="inline-flex items-center gap-1 rounded bg-[#D4AF37] px-1.5 py-0.5 text-[10px] font-bold text-[#080E18] uppercase">
                                  <ShieldCheck className="h-3 w-3" />
                                  ADMIN
                                </span>
                              ) : isGoogle ? (
                                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                                  GOOGLE
                                </span>
                              ) : (
                                <span className="rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                                  TAMU
                                </span>
                              )}

                              <p className="truncate text-sm font-semibold text-white">
                                {visitor.displayName}
                              </p>

                              {isSelf && (
                                <span className="text-[11px] font-medium text-emerald-400">
                                  (Anda)
                                </span>
                              )}

                              <span
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  onlineNow
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-white/5 text-slate-400'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    onlineNow
                                      ? 'bg-emerald-400'
                                      : 'bg-slate-500'
                                  }`}
                                />
                                {onlineNow ? 'Online' : 'Keluar'}
                              </span>
                            </div>

                            {visitor.email && (
                              <p className="mt-0.5 truncate font-mono text-[11px] text-amber-200/90">
                                {visitor.email}
                              </p>
                            )}

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <DeviceIcon className="h-3 w-3 text-slate-400" />
                                {visitor.deviceLabel} · {visitor.browserLabel}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {formatLastActive(
                                  visitor.lastSeenAt,
                                  onlineNow
                                )}
                              </span>
                              <span className="font-mono text-slate-300 tabular-nums">
                                {visitor.visitCount}x masuk
                              </span>
                            </div>

                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Pertama masuk:{' '}
                              {formatWibDateTime(visitor.firstEnteredAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <UserCheck
                            className={`h-4 w-4 ${
                              isPersonAdmin
                                ? 'text-[#D4AF37]'
                                : onlineNow
                                  ? 'text-emerald-400'
                                  : 'text-slate-600'
                            }`}
                          />
                          {!isSelf && (
                            <button
                              type="button"
                              disabled={deletingId === visitor.visitorId}
                              onClick={() =>
                                void handleDeleteVisitor(visitor.visitorId)
                              }
                              aria-label={`Hapus riwayat ${visitor.displayName}`}
                              title="Hapus log pengunjung ini"
                              className="rounded p-1 text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex flex-col justify-between gap-3 border-t border-white/10 bg-[#080E18] px-6 py-4 sm:flex-row sm:items-center">
                {!isVerifiedUser ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Login Google agar nama &amp; email terverifikasi Anda
                      tampil di daftar.
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
                    Pemantau aktif real-time — semua pengunjung baru (Google
                    maupun tamu) otomatis tersimpan.
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
