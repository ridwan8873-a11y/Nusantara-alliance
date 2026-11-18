import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Plane,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AllianceRegistration,
  RegistrationStatus,
} from '../types/allianceRegistration';

interface AdminRegistrationQueueProps {
  isAdmin: boolean;
}

export function AdminRegistrationQueue({ isAdmin }: AdminRegistrationQueueProps) {
  const [registrations, setRegistrations] = useState<AllianceRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RegistrationStatus>('ALL');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Strictly listen when isAdmin is true
  useEffect(() => {
    if (!isAdmin) {
      setRegistrations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const colPath = 'allianceRegistrations';
    const q = query(collection(db, colPath), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: AllianceRegistration[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ticketCode: String(data.ticketCode ?? 'AKA-0000'),
            airlineName: String(data.airlineName ?? '-'),
            applicantId: String(data.applicantId ?? ''),
            status: (data.status as RegistrationStatus) || 'pending',
            adminNote: data.adminNote ? String(data.adminNote) : undefined,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        setRegistrations(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        console.warn('Registrations snapshot note:', err);
      }
    );

    return () => unsubscribe();
  }, [isAdmin]);

  const handleApprove = async (item: AllianceRegistration) => {
    setActionBusyId(item.id);
    setFeedbackMsg('');
    const docPath = `allianceRegistrations/${item.id}`;
    try {
      await updateDoc(doc(db, 'allianceRegistrations', item.id), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });
      setFeedbackMsg(`Maskapai ${item.airlineName} (${item.ticketCode}) berhasil di-ACC! Notifikasi langsung terkirim ke HP pendaftar.`);
      window.setTimeout(() => setFeedbackMsg(''), 5000);
    } catch (err) {
      console.error('Approval failed:', err);
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleReject = async (item: AllianceRegistration) => {
    setActionBusyId(item.id);
    setFeedbackMsg('');
    const docPath = `allianceRegistrations/${item.id}`;
    try {
      await updateDoc(doc(db, 'allianceRegistrations', item.id), {
        status: 'rejected',
        adminNote: 'Mohon hubungi admin untuk verifikasi nama maskapai.',
        updatedAt: serverTimestamp(),
      });
      setFeedbackMsg(`Status ${item.airlineName} diubah ke Belum Diterima.`);
      window.setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      console.error('Rejection failed:', err);
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setActionBusyId(id);
    const docPath = `allianceRegistrations/${id}`;
    try {
      await deleteDoc(doc(db, 'allianceRegistrations', id));
      setFeedbackMsg(`Data antrean ${name} telah dihapus.`);
      window.setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      console.error('Deletion failed:', err);
      handleFirestoreError(err, OperationType.DELETE, docPath);
    } finally {
      setActionBusyId(null);
    }
  };

  if (!isAdmin) return null;

  const filteredRegistrations = registrations.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
      !q ||
      item.airlineName.toLowerCase().includes(q) ||
      item.ticketCode.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingCount = registrations.filter((r) => r.status === 'pending').length;
  const approvedCount = registrations.filter((r) => r.status === 'approved').length;

  return (
    <div className="rounded-xl border border-[#D4AF37]/60 bg-[#F4EFE4] p-6 text-[#111827]">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[#111827]/12 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#8C6218]">
            <ShieldCheck className="h-4 w-4" />
            <span>Manajemen Pendaftaran Masuk (Khusus Admin)</span>
          </div>
          <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-[#111827]">
            Daftar Tiket Antrean Maskapai Baru
          </h3>
          <p className="text-xs text-[#4B5563]">
            Klik tombol <strong>&quot;ACC di Game&quot;</strong> untuk menyetujui. Layar &amp; HP peserta akan langsung menerima notifikasi suara dan getar secara otomatis.
          </p>
        </div>

        {/* Clean Unboxed Status Counters */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 text-amber-800">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{pendingCount}</span> Menunggu ACC
          </span>
          <span aria-hidden="true" className="text-[#111827]/25">·</span>
          <span className="inline-flex items-center gap-1.5 text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">{approvedCount}</span> Telah di-ACC
          </span>
        </div>
      </div>

      {feedbackMsg && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400 bg-emerald-100 px-4 py-2.5 text-xs font-bold text-emerald-900 shadow-sm">
          <Check className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari maskapai / nomor tiket..."
            className="w-full rounded-md border border-amber-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-500 shadow-sm focus:border-[#D4AF37] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-600" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | RegistrationStatus)}
            className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 shadow-sm focus:border-[#D4AF37] focus:outline-none"
          >
            <option value="ALL">Semua Status ({registrations.length})</option>
            <option value="pending">Menunggu ACC ({pendingCount})</option>
            <option value="approved">Sudah di-ACC ({approvedCount})</option>
            <option value="rejected">Ditolak</option>
          </select>
        </div>
      </div>

      {/* Queue List Table */}
      <div className="mt-4 max-h-[420px] overflow-y-auto space-y-2.5 pr-1">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-600">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-amber-700" />
            <p className="mt-2 font-medium">Memuat antrean pendaftaran...</p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="rounded-lg border border-slate-300 bg-white p-8 text-center text-xs text-slate-600 shadow-sm">
            <Plane className="mx-auto h-7 w-7 text-amber-700/60" />
            <p className="mt-2 font-bold text-slate-900">Belum ada antrean pendaftaran maskapai</p>
            <p className="mt-1 text-slate-600">Saat pengunjung mendaftarkan maskapai, tiket antrean akan langsung muncul di sini.</p>
          </div>
        ) : (
          filteredRegistrations.map((item) => {
            const isBusy = actionBusyId === item.id;
            const isItemPending = item.status === 'pending';
            const isItemApproved = item.status === 'approved';

            return (
              <div
                key={item.id}
                className={`flex flex-col gap-3 rounded-lg border p-4 shadow-sm transition-all sm:flex-row sm:items-center sm:justify-between ${
                  isItemPending
                    ? 'border-amber-300 bg-white'
                    : isItemApproved
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : 'border-slate-300 bg-slate-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-black px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest text-[#FFD700]">
                      {item.ticketCode}
                    </span>
                    <h4 className="font-display text-base font-bold text-slate-950 truncate">
                      {item.airlineName}
                    </h4>
                    {isItemPending && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                        <Clock className="h-3 w-3" />
                        Menunggu ACC
                      </span>
                    )}
                    {isItemApproved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900 border border-emerald-300">
                        <Check className="h-3 w-3" />
                        Telah di-ACC
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    ID Perangkat: <span className="font-mono">{item.applicantId.slice(0, 14)}...</span>
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {!isItemApproved && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleApprove(item)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      ACC di Game
                    </button>
                  )}

                  {isItemPending && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleReject(item)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 shadow-sm disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Tolak
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDelete(item.id, item.airlineName)}
                    className="rounded-md border border-slate-300 bg-white p-2 text-slate-600 hover:bg-rose-50 hover:text-rose-700 shadow-sm disabled:opacity-50"
                    title="Hapus antrean"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
