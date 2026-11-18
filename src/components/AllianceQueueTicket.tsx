import { useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Plane,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { AllianceRegistration } from '../types/allianceRegistration';
import {
  playChimeSound,
  requestNotificationPermission,
  sendBrowserPushNotification,
  triggerHapticVibrate,
} from '../utils/notificationSound';

interface AllianceQueueTicketProps {
  registration: AllianceRegistration;
  onReset: () => void;
  onCopyMessage: () => void;
  copied: boolean;
  formattedMessage: string;
  whatsappUrl: string;
}

export function AllianceQueueTicket({
  registration,
  onReset,
  onCopyMessage,
  copied,
  formattedMessage,
  whatsappUrl,
}: AllianceQueueTicketProps) {
  const [notifGranted, setNotifGranted] = useState<boolean>(() => {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    );
  });
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [prevStatus, setPrevStatus] = useState(registration.status);

  // Monitor status changes from 'pending' to 'approved'
  useEffect(() => {
    if (prevStatus === 'pending' && registration.status === 'approved') {
      // Trigger instant sound, vibration & push notification
      playChimeSound();
      triggerHapticVibrate();
      sendBrowserPushNotification(
        'Nusantara Alliance: Maskapai Anda Telah di-ACC!',
        `Selamat! Maskapai ${registration.airlineName} telah resmi disetujui di Game oleh Admin.`
      );
      setShowCelebrationModal(true);
    }
    setPrevStatus(registration.status);
  }, [registration.status, registration.airlineName, prevStatus]);

  const handleEnableNotification = async () => {
    const granted = await requestNotificationPermission();
    setNotifGranted(granted);
    if (granted) {
      playChimeSound();
      triggerHapticVibrate();
    }
  };

  const isApproved = registration.status === 'approved';
  const isRejected = registration.status === 'rejected';
  const isPending = registration.status === 'pending';

  return (
    <div className="relative mt-2 space-y-5">
      {/* Celebration Popup when ACC is received */}
      {showCelebrationModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-emerald-400/45 bg-[#0D1524] p-6 text-center text-slate-100 shadow-2xl sm:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              Resmi di-ACC di Game
            </p>

            <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Selamat! Maskapai Disetujui
            </h3>

            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Admin telah memverifikasi pendaftaran maskapai{' '}
              <span className="font-semibold text-[#E5C158]">
                {registration.airlineName}
              </span>{' '}
              ({registration.ticketCode}). Anda sekarang resmi diterima di aliansi!
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowCelebrationModal(false)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#080E18] transition-colors hover:bg-[#E5C158]"
              >
                Konfirmasi di Grup WhatsApp
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                type="button"
                onClick={() => setShowCelebrationModal(false)}
                className="w-full rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                Tutup Notifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Boarding Pass Waiting Ticket Card */}
      <div className="overflow-hidden rounded-xl border border-[#D4AF37]/60 bg-[#F4EFE4] text-[#111827]">
        {/* Ticket Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#111827]/12 bg-[#080E18] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2 font-display text-sm font-semibold">
            <Plane className="h-4 w-4 text-[#D4AF37]" />
            <span>Tiket Antrean Nusantara Alliance</span>
          </div>
          <div className="font-mono text-xs font-bold tracking-widest text-[#E5C158]">
            {registration.ticketCode}
          </div>
        </div>

        {/* Ticket Main Details */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Status Banner */}
          {isPending && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm">
              <div className="flex items-center gap-2.5">
                <Clock className="h-5 w-5 shrink-0 text-amber-600 animate-spin duration-1000" style={{ animationDuration: '4s' }} />
                <div>
                  <p className="font-bold uppercase tracking-wider text-amber-950">
                    STATUS: MENUNGGU VERIFIKASI ADMIN
                  </p>
                  <p className="text-[11px] text-amber-800">
                    Tiket Anda aktif di antrean. Layar HP ini akan otomatis bergetar &amp; berbunyi saat Admin meng-ACC di game.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isApproved && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400 bg-emerald-50 p-3.5 text-xs text-emerald-950 shadow-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-emerald-900">
                    STATUS: TELAH DI-ACC ADMIN (RESMI DISETUJUI)
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    Pendaftaran maskapai Anda telah disetujui. Silakan bergabung ke dalam game dan sapa anggota di grup WhatsApp!
                  </p>
                </div>
              </div>
            </div>
          )}

          {isRejected && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-950 shadow-sm">
              <div className="flex items-center gap-2.5">
                <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-rose-900">
                    STATUS: PENDAFTARAN BELUM DAPAT DITERIMA
                  </p>
                  <p className="text-[11px] text-rose-800">
                    {registration.adminNote || 'Nama maskapai tidak memenuhi kriteria aliansi.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Ticket Flight Table Grid */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 text-xs">
            <div>
              <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                Nama Maskapai
              </p>
              <p className="mt-1 font-bold text-slate-950 text-sm truncate">
                {registration.airlineName}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                Aliansi Tujuan
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                Nusantara Alliance
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                Nomor Antrean
              </p>
              <p className="mt-1 font-mono font-bold text-[#8A6510]">
                {registration.ticketCode}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                Verifikasi HP
              </p>
              <p className="mt-1 font-semibold text-emerald-800 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />
                Real-Time Terkoneksi
              </p>
            </div>
          </div>

          {/* Device Notification Enabler Strip */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs">
            <div className="flex items-center gap-2 text-slate-800">
              {notifGranted ? (
                <BellRing className="h-4 w-4 text-emerald-700 shrink-0" />
              ) : (
                <Bell className="h-4 w-4 text-amber-700 shrink-0" />
              )}
              <span className="text-[11px] font-medium">
                {notifGranted
                  ? 'Notifikasi HP aktif: HP akan berbunyi & bergetar saat di-ACC.'
                  : 'Aktifkan notifikasi browser agar ada getar & suara saat di-ACC.'}
              </span>
            </div>
            {!notifGranted && (
              <button
                type="button"
                onClick={handleEnableNotification}
                className="shrink-0 rounded bg-[#D4AF37] px-3 py-1.5 text-[11px] font-bold text-[#0B1422] transition-colors hover:bg-amber-400"
              >
                Aktifkan
              </button>
            )}
          </div>

          {/* Formatted WA Message */}
          <div className="rounded-lg border border-amber-300/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-[#9A7513]">
                Pesan Pendaftaran Siap Ditempel di WhatsApp
              </p>
              {copied && (
                <span className="text-xs font-semibold text-emerald-600">
                  Tersalin ke clipboard
                </span>
              )}
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-900">
              {formattedMessage}
              {`\n*Nomor Tiket Antrean:* ${registration.ticketCode}`}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onCopyMessage}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-[#D4AF37] px-5 py-3 text-sm font-bold text-[#0B1422] whitespace-nowrap transition-colors hover:bg-[#E5C158] shadow-sm"
            >
              Salin &amp; Masuk Grup WhatsApp
              <ExternalLink className="h-4 w-4" />
            </a>

            <button
              type="button"
              onClick={onCopyMessage}
              className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 shadow-sm"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-slate-700" />
                  Salin Pesan
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-slate-600 hover:text-slate-950 hover:underline"
            >
              Daftarkan Maskapai Lain
            </button>
            <span className="text-[11px] text-slate-600 font-mono">
              Tiket ID: {registration.id}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
