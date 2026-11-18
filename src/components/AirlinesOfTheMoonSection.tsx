import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  ImagePlus,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutAccount,
} from '../lib/firebase';
import {
  MOON_EVENT_ANNOUNCEMENT_ISO,
  MOON_EVENT_ANNOUNCEMENT_LABEL,
  MOON_EVENT_DEADLINE_ISO,
  MOON_EVENT_DEADLINE_LABEL,
  MOON_EVENT_LIMITS,
  MOON_EVENT_OPEN_DATE_LABEL,
  MOON_EVENT_OPEN_ISO,
  type AotmEventPhase,
  type JudgeStatus,
  type MoonEventSubmission,
} from '../types/moonEvent';
import {
  compressImageFile,
  type CompressedImageResult,
} from '../utils/imageCompression';
import { AdminEvaluationVault } from './AdminEvaluationVault';
import { AotmWinnerAnnouncement } from './AotmWinnerAnnouncement';

interface AirlinesOfTheMoonSectionProps {
  user: User | null;
  authReady: boolean;
}

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function computeCountdownTo(targetIso: string, nowMs: number): CountdownParts {
  const targetMs = new Date(targetIso).getTime();
  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function getNaturalPhase(nowMs: number): AotmEventPhase {
  const openMs = new Date(MOON_EVENT_OPEN_ISO).getTime();
  const deadlineMs = new Date(MOON_EVENT_DEADLINE_ISO).getTime();
  const announcementMs = new Date(MOON_EVENT_ANNOUNCEMENT_ISO).getTime();

  if (nowMs < openMs) return 'before_open';
  if (nowMs < deadlineMs) return 'submission_open';
  if (nowMs < announcementMs) return 'judging';
  return 'announcement';
}

function parseNumericField(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return num;
}

const REQUIRED_ITEMS_CHECKLIST = [
  'Nama maskapai',
  'Alliance',
  'Total profit',
  'Codeshare profit',
  'Operating profit',
  'Revenue',
  'Operating cost',
  'Foto profit maskapai (upload foto asli)',
  'Foto maskapai (upload foto asli)',
];

const ADMIN_PHASE_OPTIONS: Array<{
  value: 'auto' | AotmEventPhase;
  label: string;
}> = [
  { value: 'auto', label: 'Sesuai Jadwal' },
  { value: 'submission_open', label: 'Pengumpulan (26 Nov)' },
  { value: 'judging', label: 'Penilaian (27–28 Nov)' },
  { value: 'announcement', label: 'Pengumuman (28 Nov 19:00)' },
];

export function AirlinesOfTheMoonSection({
  user,
  authReady,
}: AirlinesOfTheMoonSectionProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [adminPhaseOverride, setAdminPhaseOverride] = useState<
    'auto' | AotmEventPhase
  >('auto');
  const [fireModeOverride, setFireModeOverride] = useState<'auto' | 'red' | 'blue'>(
    'auto'
  );

  const openMs = new Date(MOON_EVENT_OPEN_ISO).getTime();
  const diffToOpenMs = openMs - nowMs;
  const daysUntilOpen = diffToOpenMs / (1000 * 60 * 60 * 24);

  const resolvedFireMode = useMemo(() => {
    if (fireModeOverride !== 'auto') return fireModeOverride;
    // -3 days until Event Day (H): Blue Fire
    if (daysUntilOpen <= 3) return 'blue';
    // -7 to -3 days before event opening: Red Fire
    return 'red';
  }, [fireModeOverride, daysUntilOpen]);

  const [scrollY, setScrollY] = useState(0);
  const [isExtinguished, setIsExtinguished] = useState(false);
  const [showWaterSplash, setShowWaterSplash] = useState(false);
  const [pointerStartX, setPointerStartX] = useState<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    setPointerStartX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerStartX === null) return;
    const diff = e.clientX - pointerStartX;
    if (Math.abs(diff) > 40) {
      triggerWaterEasterEgg();
      setPointerStartX(null);
    }
  };

  const handlePointerUp = () => {
    setPointerStartX(null);
  };

  const triggerWaterEasterEgg = () => {
    if (isExtinguished || showWaterSplash) return;
    setShowWaterSplash(true);
    window.setTimeout(() => {
      setIsExtinguished(true);
    }, 600);
    window.setTimeout(() => {
      setIsExtinguished(false);
      setShowWaterSplash(false);
    }, 3200);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Form states
  const [airlineName, setAirlineName] = useState('');
  const [alliance, setAlliance] = useState('Nusantara Alliance');
  const [totalProfit, setTotalProfit] = useState('');
  const [codeshareProfit, setCodeshareProfit] = useState('');
  const [operatingProfit, setOperatingProfit] = useState('');
  const [revenue, setRevenue] = useState('');
  const [operatingCost, setOperatingCost] = useState('');
  const [profitPhoto, setProfitPhoto] =
    useState<CompressedImageResult | null>(null);
  const [airlinePhoto, setAirlinePhoto] =
    useState<CompressedImageResult | null>(null);
  const [compressingTarget, setCompressingTarget] = useState<
    'profit' | 'airline' | null
  >(null);

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    airlineName: string;
    alliance: string;
    submittedAtLabel: string;
  } | null>(null);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Admin-only submissions state
  const [submissions, setSubmissions] = useState<MoonEventSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [submittedEmailList, setSubmittedEmailList] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem('aotm_all_submitted_emails');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const isVerifiedUser = Boolean(user && user.emailVerified);
  const isAdmin = Boolean(
    isVerifiedUser &&
      user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  // Synchronize submitted emails from submissions list when admin or from current user
  useEffect(() => {
    if (submissions.length > 0) {
      const emails = Array.from(
        new Set(
          submissions
            .map((s) => s.submittedByEmail)
            .filter((e): e is string => Boolean(e && e.includes('@')))
        )
      );
      if (emails.length > 0) {
        setSubmittedEmailList((prev) => {
          const merged = Array.from(new Set([...prev, ...emails]));
          try {
            window.localStorage.setItem(
              'aotm_all_submitted_emails',
              JSON.stringify(merged)
            );
          } catch {
            // Ignore storage errors
          }
          return merged;
        });
      }
    }
  }, [submissions]);

  // Restore last submission receipt for the signed-in user so reloads keep proof visible
  useEffect(() => {
    if (!user?.uid) {
      setSubmittedReceipt(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(`aotm_receipt_v1_${user.uid}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        airlineName?: string;
        alliance?: string;
        submittedAtLabel?: string;
      };
      if (parsed.airlineName && parsed.submittedAtLabel) {
        setSubmittedReceipt({
          airlineName: parsed.airlineName,
          alliance: parsed.alliance || 'Nusantara Alliance',
          submittedAtLabel: parsed.submittedAtLabel,
        });
        if (user.email) {
          setSubmittedEmailList((prev) => {
            if (prev.includes(user.email!)) return prev;
            const updated = [...prev, user.email!];
            try {
              window.localStorage.setItem(
                'aotm_all_submitted_emails',
                JSON.stringify(updated)
              );
            } catch {
              // Ignore
            }
            return updated;
          });
        }
      }
    } catch {
      // Ignore storage error
    }
  }, [user?.uid, user?.email]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const naturalPhase = getNaturalPhase(nowMs);
  const activePhase: AotmEventPhase =
    isAdmin && adminPhaseOverride !== 'auto'
      ? adminPhaseOverride
      : naturalPhase;

  const isAnnouncementActive = activePhase === 'announcement';
  const isSubmissionOpen = activePhase === 'submission_open';

  // Strictly attach listener ONLY when authReady && isAdmin so non-admins never issue list queries
  useEffect(() => {
    if (!authReady || !isAdmin) {
      setSubmissions([]);
      setLoadingSubmissions(false);
      return;
    }

    setLoadingSubmissions(true);
    setAdminError('');
    const colPath = 'moonEventSubmissions';
    const q = query(collection(db, colPath), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: MoonEventSubmission[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            airlineName: String(data.airlineName ?? ''),
            alliance: String(data.alliance ?? ''),
            totalProfit: Number(data.totalProfit ?? 0),
            codeshareProfit: Number(data.codeshareProfit ?? 0),
            operatingProfit: Number(data.operatingProfit ?? 0),
            revenue: Number(data.revenue ?? 0),
            operatingCost: Number(data.operatingCost ?? 0),
            profitPhotoDataUrl: String(data.profitPhotoDataUrl ?? ''),
            airlinePhotoDataUrl: String(data.airlinePhotoDataUrl ?? ''),
            submittedByUid: String(data.submittedByUid ?? ''),
            submittedByEmail: String(data.submittedByEmail ?? ''),
            judgeStatus: data.judgeStatus as JudgeStatus | undefined,
            adminScore:
              typeof data.adminScore === 'number' ? data.adminScore : undefined,
            adminNote:
              typeof data.adminNote === 'string' ? data.adminNote : undefined,
            aiScore: typeof data.aiScore === 'number' ? data.aiScore : undefined,
            aiRecommendedStatus: data.aiRecommendedStatus as
              | JudgeStatus
              | undefined,
            aiPhotoMatchStatus: data.aiPhotoMatchStatus as
              | 'Sesuai'
              | 'Perlu Cek Manual'
              | 'Tidak Sesuai'
              | undefined,
            aiTop1Eligible:
              typeof data.aiTop1Eligible === 'boolean'
                ? data.aiTop1Eligible
                : undefined,
            aiSummaryNote:
              typeof data.aiSummaryNote === 'string'
                ? data.aiSummaryNote
                : undefined,
            aiSignature:
              typeof data.aiSignature === 'string'
                ? data.aiSignature
                : undefined,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        setSubmissions(items);
        setLoadingSubmissions(false);
      },
      (err) => {
        setLoadingSubmissions(false);
        setAdminError('Gagal memuat data peserta event.');
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    );

    return () => unsubscribe();
  }, [authReady, isAdmin]);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError('Login Google dibatalkan atau gagal. Silakan coba lagi.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError('');
    setAdminPhaseOverride('auto');
    await signOutAccount();
  };

  const handlePhotoUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    target: 'profit' | 'airline'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFormError('');
    setCompressingTarget(target);
    try {
      const compressed = await compressImageFile(file);
      if (target === 'profit') {
        setProfitPhoto(compressed);
      } else {
        setAirlinePhoto(compressed);
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Gagal memproses file foto yang dipilih.'
      );
    } finally {
      setCompressingTarget(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!isSubmissionOpen) {
      setFormError(
        activePhase === 'before_open'
          ? `Pengumpulan AOTM Nusantara Alliance baru dibuka pada ${MOON_EVENT_OPEN_DATE_LABEL}.`
          : `Batas pengumpulan AOTM Nusantara Alliance sudah ditutup pada ${MOON_EVENT_DEADLINE_LABEL}.`
      );
      return;
    }

    if (!user || !user.emailVerified || !user.email) {
      setFormError(
        'Silakan login dengan akun Google terverifikasi terlebih dahulu sebelum mengirim laporan.'
      );
      return;
    }

    const trimmedAirline = airlineName.trim();
    const trimmedAlliance = alliance.trim();
    if (
      trimmedAirline.length < MOON_EVENT_LIMITS.airlineNameMin ||
      trimmedAirline.length > MOON_EVENT_LIMITS.airlineNameMax
    ) {
      setFormError(
        `Nama maskapai harus antara ${MOON_EVENT_LIMITS.airlineNameMin} hingga ${MOON_EVENT_LIMITS.airlineNameMax} karakter.`
      );
      return;
    }
    if (
      trimmedAlliance.length < MOON_EVENT_LIMITS.allianceMin ||
      trimmedAlliance.length > MOON_EVENT_LIMITS.allianceMax
    ) {
      setFormError(
        `Nama alliance harus antara ${MOON_EVENT_LIMITS.allianceMin} hingga ${MOON_EVENT_LIMITS.allianceMax} karakter.`
      );
      return;
    }

    const parsedTotalProfit = parseNumericField(totalProfit);
    const parsedCodeshareProfit = parseNumericField(codeshareProfit);
    const parsedOperatingProfit = parseNumericField(operatingProfit);
    const parsedRevenue = parseNumericField(revenue);
    const parsedOperatingCost = parseNumericField(operatingCost);

    if (
      parsedTotalProfit === null ||
      parsedCodeshareProfit === null ||
      parsedOperatingProfit === null ||
      parsedRevenue === null ||
      parsedOperatingCost === null
    ) {
      setFormError(
        'Semua kolom angka profit, revenue, dan operating cost wajib diisi dengan angka yang valid.'
      );
      return;
    }

    if (parsedRevenue < 0 || parsedOperatingCost < 0) {
      setFormError('Revenue dan Operating cost tidak boleh bernilai negatif.');
      return;
    }

    if (
      Math.abs(parsedTotalProfit) > MOON_EVENT_LIMITS.maxNumericAbs ||
      Math.abs(parsedCodeshareProfit) > MOON_EVENT_LIMITS.maxNumericAbs ||
      Math.abs(parsedOperatingProfit) > MOON_EVENT_LIMITS.maxNumericAbs ||
      parsedRevenue > MOON_EVENT_LIMITS.maxNumericAbs ||
      parsedOperatingCost > MOON_EVENT_LIMITS.maxNumericAbs
    ) {
      setFormError('Nilai angka melebihi batas maksimum yang diizinkan.');
      return;
    }

    if (!profitPhoto || !airlinePhoto) {
      setFormError(
        'Kedua foto asli wajib diunggah: Foto profit maskapai dan Foto maskapai.'
      );
      return;
    }

    if (
      profitPhoto.dataUrl.length > MOON_EVENT_LIMITS.maxPhotoDataUrlLength ||
      airlinePhoto.dataUrl.length > MOON_EVENT_LIMITS.maxPhotoDataUrlLength
    ) {
      setFormError(
        'Ukuran foto melebihi batas. Silakan unggah ulang foto yang lebih ringan.'
      );
      return;
    }

    const randomSuffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
        : Math.random().toString(36).slice(2, 12);
    const submissionId = `moon_${Date.now()}_${randomSuffix}`;
    const docPath = `moonEventSubmissions/${submissionId}`;

    setSubmitting(true);
    try {
      // Automatically run server-side AI evaluation at submission time (works even when Admin is offline)
      let aiFields: Record<string, unknown> = {};
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 16000);
        const aiRes = await fetch('/api/ai/evaluate-submission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            airlineName: trimmedAirline,
            alliance: trimmedAlliance,
            totalProfit: parsedTotalProfit,
            codeshareProfit: parsedCodeshareProfit,
            operatingProfit: parsedOperatingProfit,
            revenue: parsedRevenue,
            operatingCost: parsedOperatingCost,
            profitPhotoDataUrl: profitPhoto.dataUrl,
            airlinePhotoDataUrl: airlinePhoto.dataUrl,
          }),
        });
        window.clearTimeout(timeoutId);

        const contentType = aiRes.headers.get('content-type') || '';
        if (aiRes.ok && contentType.includes('application/json')) {
          const aiJson = (await aiRes.json()) as {
            score?: unknown;
            recommendedStatus?: unknown;
            photoMatchStatus?: unknown;
            top1Eligible?: unknown;
            summaryNote?: unknown;
            aiSignature?: unknown;
          };
          const validStatuses = [
            'Menunggu',
            'Terverifikasi',
            'Juara 1',
            'Juara 2',
            'Juara 3',
            'Diskualifikasi',
          ];
          const validPhotoStatuses = [
            'Sesuai',
            'Perlu Cek Manual',
            'Tidak Sesuai',
          ];
          const rawScore = Number(aiJson.score);
          const rawRec = String(aiJson.recommendedStatus || '');
          const rawPhoto = String(aiJson.photoMatchStatus || '');
          const rawSig = String(aiJson.aiSignature || '').trim();
          const rawNote = String(aiJson.summaryNote || '').slice(
            0,
            MOON_EVENT_LIMITS.adminNoteMax
          );

          if (
            Number.isFinite(rawScore) &&
            rawScore >= MOON_EVENT_LIMITS.adminScoreMin &&
            rawScore <= MOON_EVENT_LIMITS.adminScoreMax &&
            validStatuses.includes(rawRec) &&
            validPhotoStatuses.includes(rawPhoto) &&
            /^[a-f0-9]{64}$/.test(rawSig)
          ) {
            aiFields = {
              aiScore: Math.round(rawScore * 100) / 100,
              aiRecommendedStatus: rawRec,
              aiPhotoMatchStatus: rawPhoto,
              aiTop1Eligible: aiJson.top1Eligible === true,
              aiSummaryNote: rawNote,
              aiSignature: rawSig,
            };
          }
        }
      } catch {
        // Never block participant submission if AI endpoint is busy or unavailable
        aiFields = {};
      }

      await setDoc(doc(db, 'moonEventSubmissions', submissionId), {
        airlineName: trimmedAirline,
        alliance: trimmedAlliance,
        totalProfit: parsedTotalProfit,
        codeshareProfit: parsedCodeshareProfit,
        operatingProfit: parsedOperatingProfit,
        revenue: parsedRevenue,
        operatingCost: parsedOperatingCost,
        profitPhotoDataUrl: profitPhoto.dataUrl,
        airlinePhotoDataUrl: airlinePhoto.dataUrl,
        submittedByUid: user.uid,
        submittedByEmail: user.email,
        ...aiFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const receiptData = {
        airlineName: trimmedAirline,
        alliance: trimmedAlliance,
        submittedAtLabel: new Date().toLocaleString('id-ID', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      };
      setSubmittedReceipt(receiptData);
      try {
        window.localStorage.setItem(
          `aotm_receipt_v1_${user.uid}`,
          JSON.stringify(receiptData)
        );
      } catch {
        // Ignore storage error
      }

      if (user.email) {
        setSubmittedEmailList((prev) => {
          if (prev.includes(user.email!)) return prev;
          const next = [...prev, user.email!];
          try {
            window.localStorage.setItem(
              'aotm_all_submitted_emails',
              JSON.stringify(next)
            );
          } catch {
            // Ignore
          }
          return next;
        });
      }

      setAirlineName('');
      setTotalProfit('');
      setCodeshareProfit('');
      setOperatingProfit('');
      setRevenue('');
      setOperatingCost('');
      setProfitPhoto(null);
      setAirlinePhoto(null);
    } catch (err) {
      setFormError(
        'Terjadi kesalahan saat mengirim data. Pastikan koneksi stabil dan Anda sudah login dengan Google.'
      );
      handleFirestoreError(err, OperationType.CREATE, docPath);
    } finally {
      setSubmitting(false);
    }
  };

  const countdownMeta = useMemo(() => {
    switch (activePhase) {
      case 'before_open':
        return {
          title: 'Hitung Mundur Pembukaan Event',
          parts: computeCountdownTo(MOON_EVENT_OPEN_ISO, nowMs),
        };
      case 'submission_open':
        return {
          title: 'Batas Akhir Pengumpulan Data',
          parts: computeCountdownTo(MOON_EVENT_DEADLINE_ISO, nowMs),
        };
      case 'judging':
        return {
          title: 'Hitung Mundur Pengumuman Pemenang (19.00 WIB)',
          parts: computeCountdownTo(MOON_EVENT_ANNOUNCEMENT_ISO, nowMs),
        };
      case 'announcement':
        return null;
    }
  }, [activePhase, nowMs]);

  const countdownBlocks = useMemo(() => {
    if (!countdownMeta) return [];
    return [
      {
        label: 'Hari',
        value: String(countdownMeta.parts.days).padStart(2, '0'),
      },
      {
        label: 'Jam',
        value: String(countdownMeta.parts.hours).padStart(2, '0'),
      },
      {
        label: 'Menit',
        value: String(countdownMeta.parts.minutes).padStart(2, '0'),
      },
      {
        label: 'Detik',
        value: String(countdownMeta.parts.seconds).padStart(2, '0'),
      },
    ];
  }, [countdownMeta]);

  const liveFinancialPreview = useMemo(() => {
    const tp = parseNumericField(totalProfit);
    const rev = parseNumericField(revenue);
    const cost = parseNumericField(operatingCost);
    const op = parseNumericField(operatingProfit);
    const cs = parseNumericField(codeshareProfit);
    const marginPct =
      tp !== null && rev !== null && rev > 0 ? (tp / rev) * 100 : null;
    const filledCount = [tp, rev, cost, op, cs].filter(
      (v) => v !== null
    ).length;
    return {
      tp,
      rev,
      marginPct,
      filledCount,
      totalProfitValid: tp !== null,
      codeshareProfitValid: cs !== null,
      operatingProfitValid: op !== null,
      revenueValid: rev !== null && rev >= 0,
      operatingCostValid: cost !== null && cost >= 0,
      totalProfitDisplay:
        tp !== null ? tp.toLocaleString('id-ID') : totalProfit.trim(),
    };
  }, [totalProfit, revenue, operatingCost, operatingProfit, codeshareProfit]);

  const tickerItems = useMemo(() => {
    if (submittedEmailList.length === 0) {
      return [
        {
          email: 'Formulir dibuka 26 Nov 2026',
          status: 'Akun yang telah mengisi AOTM akan berjalan di sini',
        },
        {
          email: 'Formulir dibuka 26 Nov 2026',
          status: 'Akun yang telah mengisi AOTM akan berjalan di sini',
        },
      ];
    }
    const base = submittedEmailList.map((email) => ({
      email,
      status: 'Laporan Masuk',
    }));
    return [...base, ...base, ...base];
  }, [submittedEmailList]);

  return (
    <section
      id="airlines-of-the-moon"
      className="mt-4 scroll-mt-24 space-y-10 sm:mt-6"
    >
      {/* Admin Account & Phase Simulator Bar */}
      {isAdmin && (
        <div className="rounded-lg border border-white/12 bg-[#0D1524] px-4 py-3">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#E5C158]">
                <ShieldCheck className="h-4 w-4" />
                Kontrol Admin ({user?.email})
              </span>
              <span className="text-white/25">·</span>
              <a
                href="#brankas-admin"
                className="font-medium text-slate-200 underline decoration-white/30 underline-offset-4 hover:text-white"
              >
                Brankas Penilaian ({submissions.length})
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-medium text-slate-400">
                  Simulasi Fase:
                </span>
                {ADMIN_PHASE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAdminPhaseOverride(opt.value)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      adminPhaseOverride === opt.value
                        ? 'bg-[#D4AF37] text-[#080E18] font-semibold'
                        : 'border border-white/12 bg-[#080E18] text-slate-300 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-l border-white/10 pl-3">
                <span className="mr-1 text-[11px] font-medium text-slate-400">
                  Efek Api:
                </span>
                <button
                  type="button"
                  onClick={() => setFireModeOverride('auto')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    fireModeOverride === 'auto'
                      ? 'bg-[#D4AF37] text-[#080E18] font-semibold'
                      : 'border border-white/12 bg-[#080E18] text-slate-300 hover:text-white'
                  }`}
                >
                  Otomatis
                </button>
                <button
                  type="button"
                  onClick={() => setFireModeOverride('red')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    fireModeOverride === 'red'
                      ? 'bg-orange-600 text-white font-semibold'
                      : 'border border-white/12 bg-[#080E18] text-orange-300 hover:text-white'
                  }`}
                >
                  🔥 Api Merah (H-7 s.d. -3)
                </button>
                <button
                  type="button"
                  onClick={() => setFireModeOverride('blue')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    fireModeOverride === 'blue'
                      ? 'bg-cyan-600 text-white font-semibold'
                      : 'border border-white/12 bg-[#080E18] text-cyan-300 hover:text-white'
                  }`}
                >
                  🔥 Api Biru (H-3 s.d. H)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 5 (28 Nov 2026, 19:00 WIB+): Official Replacement Announcement */}
      {isAnnouncementActive ? (
        <AotmWinnerAnnouncement active={isAnnouncementActive} />
      ) : (
        /* PHASES 1–4: Editorial Hero, Executive Criteria Dossier, and 9-Column Report Form */
        <div className="space-y-10">
          {/* Section 1: Open Editorial Hero & Flight Operations Schedule */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-8 border-b border-white/10 pb-8 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-7">
                <div className="mb-2">
                  <p className="text-xs font-medium text-[#D4AF37]">
                    Kompetisi Resmi Nusantara Alliance · 26–28 November 2026
                  </p>
                </div>

                <div
                  className="relative mt-3 cursor-pointer select-none group"
                  onClick={triggerWaterEasterEgg}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  title="Klik atau geser untuk Easter Egg Air & Api!"
                >
                  {/* Scroll-following trailing fire ember effect */}
                  <div
                    className="absolute inset-0 -z-10 pointer-events-none overflow-visible"
                    style={{
                      transform: `translateY(${scrollY * 0.22}px)`,
                    }}
                  >
                    {!isExtinguished && (
                      <>
                        <div
                          className={`absolute -left-4 top-2 h-12 w-12 rounded-full blur-xl opacity-60 ${
                            resolvedFireMode === 'blue' ? 'bg-cyan-400' : 'bg-orange-500'
                          }`}
                        />
                        <div
                          className={`absolute right-10 bottom-0 h-10 w-10 rounded-full blur-xl opacity-50 ${
                            resolvedFireMode === 'blue' ? 'bg-blue-500' : 'bg-red-600'
                          }`}
                        />
                      </>
                    )}
                  </div>

                  {/* Water Splash Easter Egg Overlay (Silent splash wash) */}
                  {showWaterSplash && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none overflow-visible">
                      <div className="absolute inset-0 bg-blue-500/40 rounded-2xl blur-xl water-splash-effect" />
                    </div>
                  )}

                  <h1
                    className={`font-display font-bold tracking-tight text-balance transition-all duration-500 ${
                      isExtinguished
                        ? 'extinguished-text'
                        : resolvedFireMode === 'blue'
                          ? 'fire-chars-blue'
                          : 'fire-chars-red'
                    }`}
                    style={{ fontSize: 'clamp(2.25rem, 4vw, 3.25rem)', lineHeight: 1.08 }}
                  >
                    AOTM Nusantara Alliance
                  </h1>

                  <p className="mt-1 text-[11px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    💧 Easter Egg: Klik atau geser (swipe) tulisan ini untuk menyiram air &amp; memadamkan api!
                  </p>
                </div>

                {/* Running Marquee Text of Submitted Accounts */}
                <div className="mt-3.5 flex items-center overflow-hidden rounded-lg border border-white/10 bg-[#0D1524]/80 px-3 py-1.5 backdrop-blur-sm">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wide whitespace-nowrap shrink-0 pr-3 border-r border-white/10">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                    </span>
                    Sudah Mengisi:
                  </span>
                  <div className="relative overflow-hidden w-full ml-2">
                    <div className="animate-marquee whitespace-nowrap text-xs text-slate-300">
                      {tickerItems.map((item, idx) => (
                        <span key={idx} className="inline-flex items-center gap-2 px-3">
                          <span className="font-mono text-emerald-300 font-medium">
                            {item.email}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({item.status})
                          </span>
                          <span className="text-white/20">·</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-[15px]">
                  Kompetisi evaluasi kinerja finansial dan armada maskapai bagi
                  seluruh anggota aliansi. Pengumpulan laporan dibuka pada{' '}
                  <span className="font-medium text-white">
                    {MOON_EVENT_OPEN_DATE_LABEL}
                  </span>{' '}
                  hingga{' '}
                  <span className="font-medium text-white">
                    {MOON_EVENT_DEADLINE_LABEL}
                  </span>
                  , ditutup dengan pengumuman juara Top 1–10 pada{' '}
                  <span className="font-medium text-white">
                    {MOON_EVENT_ANNOUNCEMENT_LABEL}
                  </span>
                  .
                </p>
              </div>

              {/* Right Column: Clean Operations Countdown & Schedule Ledger */}
              <div className="lg:col-span-5">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm">
                  {countdownMeta && (
                    <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4">
                      <p className="text-xs font-semibold text-[#8C6218]">
                        {countdownMeta.title}
                      </p>
                      <div className="mt-3 grid grid-cols-4 divide-x divide-slate-200 text-center">
                        {countdownBlocks.map((block) => (
                          <div key={block.label} className="px-2">
                            <p className="font-mono text-2xl font-bold text-slate-950 tabular-nums">
                              {block.value}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                              {block.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-slate-100 px-5 py-1 text-xs bg-white">
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-slate-600 font-medium">Pembukaan</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        26 Nov 2026 · 00.00 WIB
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-slate-600 font-medium">Batas Pengumpulan</span>
                      <span className="font-mono font-semibold text-[#B45309] tabular-nums">
                        27 Nov 2026 · 00.00 WIB
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-slate-600 font-medium">Penilaian Dewan Juri</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        27–28 Nov 2026
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-slate-600 font-medium">Pengumuman Juara</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        28 Nov 2026 · 19.00 WIB
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Confidentiality & Account Bar */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-400">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" />
                <span>
                  <strong className="font-medium text-slate-200">
                    Privasi Terjamin:
                  </strong>{' '}
                  Seluruh data keuangan dan bukti foto maskapai hanya dapat
                  dilihat oleh Admin / Owner Nusantara Alliance.
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {!authReady ? (
                  <span className="text-xs text-slate-400">
                    Memeriksa sesi...
                  </span>
                ) : user ? (
                  <>
                    <span className="text-xs text-slate-300">
                      {isAdmin ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#E5C158]">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Admin: {user.email}
                        </span>
                      ) : (
                        <span>Akun: {user.email}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors hover:border-white/30 hover:text-white"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Keluar
                    </button>
                  </>
                ) : (
                  <button
                    id="aotm-google-login-btn"
                    type="button"
                    disabled={authBusy}
                    onClick={handleGoogleSignIn}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0D1524] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap transition-colors hover:border-[#D4AF37]/60 hover:text-[#E5C158] disabled:opacity-60"
                  >
                    <LogIn className="h-3.5 w-3.5 text-[#D4AF37]" />
                    {authBusy
                      ? 'Menghubungkan...'
                      : 'Login Google (Peserta / Admin)'}
                  </button>
                )}
              </div>
            </div>

            {authError && (
              <p className="text-xs font-medium text-rose-400">{authError}</p>
            )}
          </div>

          {/* Section 2: Kriteria Penilaian Dewan Juri */}
          <div
            id="kriteria-penilaian"
            className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8"
          >
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold text-[#8C6218]">
                  Penting Dibaca · Standar Evaluasi Resmi
                </p>
                <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-950 sm:text-2xl text-balance">
                  Kriteria Penilaian Dewan Juri
                </h2>
              </div>
              <p className="text-xs font-medium text-slate-500">
                Diverifikasi oleh Admin &amp; Owner Nusantara Alliance
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="pt-1 md:pt-0 md:pr-6">
                <p className="font-mono text-xs font-semibold text-[#8C6218] tabular-nums">
                  01 · Keaslian Bukti Visual
                </p>
                <h3 className="mt-2 font-display text-base font-semibold text-slate-950">
                  Tangkapan Layar Asli Tanpa Editan
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                  Foto laporan profit dan profil armada wajib merupakan tangkapan
                  layar asli langsung dari dalam game agar keabsahan laporan
                  dapat diverifikasi akurat.
                </p>
              </div>

              <div className="pt-5 md:px-6 md:pt-0">
                <p className="font-mono text-xs font-semibold text-[#8C6218] tabular-nums">
                  02 · Akurasi Data Keuangan
                </p>
                <h3 className="mt-2 font-display text-base font-semibold text-slate-950">
                  Kesesuaian 5 Angka Finansial
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                  Total Profit, Codeshare Profit, Operating Profit, Revenue, dan
                  Operating Cost harus tercatat persis sama antara formulir dan
                  bukti foto profit.
                </p>
              </div>

              <div className="pt-5 md:pl-6 md:pt-0">
                <p className="font-mono text-xs font-semibold text-[#8C6218] tabular-nums">
                  03 · Margin &amp; Efisiensi Armada
                </p>
                <h3 className="mt-2 font-display text-base font-semibold text-slate-950">
                  Performa Laba &amp; Rasio Efisiensi
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-[13px]">
                  Penilaian juara Top 1–10 memadukan capaian laba bersih
                  tertinggi, efisiensi biaya operasional, serta konsistensi
                  pertumbuhan maskapai.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Submission Form Columns / Pre-Open Ledger / Judging Notice */}
          <div
            id="laporan-maskapai-aotm"
            className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-10"
          >
            {activePhase === 'before_open' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#8C6218]">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Formulir Dibuka {MOON_EVENT_OPEN_DATE_LABEL}</span>
                  </div>
                  <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950 text-balance">
                    Pengumpulan Laporan Maskapai Belum Dibuka
                  </h2>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Ke-9 kolom laporan dan pengunggahan bukti foto maskapai akan
                    tampil otomatis pada saat pembukaan resmi event mulai{' '}
                    <span className="font-medium text-slate-950">
                      {MOON_EVENT_OPEN_DATE_LABEL}
                    </span>{' '}
                    hingga{' '}
                    <span className="font-medium text-slate-950">
                      {MOON_EVENT_DEADLINE_LABEL}
                    </span>
                    .
                  </p>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Silakan persiapkan data laporan dan tangkapan layar dari dalam
                    game terlebih dahulu.
                  </p>
                </div>

                <div className="lg:col-span-5">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Jadwal Pembukaan Event
                    </p>
                    <p className="mt-2 font-display text-lg font-bold text-slate-950">
                      {MOON_EVENT_OPEN_DATE_LABEL} · 00.00 WIB
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Formulir 9 kolom akan terbuka dan dapat diakses peserta
                      secara langsung.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activePhase === 'judging' && (
              <div className="flex items-start gap-3.5">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#8C6218]" />
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-950">
                    Pengumpulan Laporan Resmi Ditutup
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    Batas pengumpulan laporan AOTM Nusantara Alliance telah
                    berakhir pada{' '}
                    <span className="font-medium text-slate-950">
                      {MOON_EVENT_DEADLINE_LABEL}
                    </span>
                    . Saat ini juri sedang melakukan tahap penilaian akhir.
                  </p>
                  <p className="mt-2.5 text-xs text-slate-500">
                    Pengumuman pemenang resmi Top 1–10 dimulai pada{' '}
                    <strong className="font-medium text-slate-900">
                      {MOON_EVENT_ANNOUNCEMENT_LABEL}
                    </strong>
                    . Informasi lanjutan dapat dipantau melalui Grup WhatsApp
                    resmi Nusantara Alliance.
                  </p>
                </div>
              </div>
            )}

            {isSubmissionOpen && (
              <div>
                <div className="mb-8 flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-xs font-semibold text-[#8C6218]">
                      Formulir Resmi Peserta · 9 Kolom Wajib
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-950 sm:text-2xl text-balance">
                      Kirim Laporan Performa Maskapai
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500">
                    Isi sesuai angka asli di dalam game · Kolom bertanda{' '}
                    <span className="font-semibold text-[#8C6218]">*</span> wajib diisi
                  </p>
                </div>

                {isAdmin && naturalPhase !== 'submission_open' && (
                  <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
                    Mode Simulasi Pengumpulan aktif — Anda dapat mengirim contoh
                    data untuk menguji Brankas Penilaian sebelum pembukaan
                    publik ({MOON_EVENT_OPEN_DATE_LABEL}).
                  </div>
                )}

                {submittedReceipt && (
                  <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <div className="flex-1">
                        <h3 className="font-display text-base font-semibold text-emerald-900">
                          Laporan AOTM Nusantara Alliance Berhasil Dikirim
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                          Data maskapai{' '}
                          <span className="font-semibold text-emerald-950">
                            {submittedReceipt.airlineName}
                          </span>{' '}
                          ({submittedReceipt.alliance}) telah tersimpan dengan
                          aman pada {submittedReceipt.submittedAtLabel}. Hanya
                          Admin Aliansi yang dapat melihat laporan dan foto Anda.
                        </p>
                        <button
                          type="button"
                          onClick={() => setSubmittedReceipt(null)}
                          className="mt-3 text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Tutup notifikasi ini
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!isVerifiedUser ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-900">
                    <h3 className="font-display text-lg font-semibold text-slate-950">
                      Login Google Diperlukan untuk Mengisi Kolom Laporan
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-600">
                      Masuk dengan akun Google terverifikasi Anda untuk membuka
                      ke-9 kolom laporan maskapai dan mengunggah bukti foto
                      secara aman.
                    </p>
                    <button
                      id="aotm-form-login-btn"
                      type="button"
                      disabled={authBusy}
                      onClick={handleGoogleSignIn}
                      className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-5 py-2.5 text-xs font-semibold text-[#080E18] transition-colors hover:bg-[#E5C158] disabled:opacity-60"
                    >
                      <LogIn className="h-4 w-4" />
                      {authBusy ? 'Menghubungkan...' : 'Masuk dengan Google'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-9">
                    {/* Group 01: Identitas Maskapai */}
                    <div className="space-y-5">
                      <div className="flex items-baseline gap-2.5 border-b border-slate-200 pb-2.5">
                        <span className="font-mono text-xs font-semibold text-[#8C6218]">
                          01.
                        </span>
                        <h3 className="font-display text-sm font-semibold text-slate-950">
                          Identitas Maskapai &amp; Aliansi
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="moon-airline-name"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Nama Maskapai{' '}
                            <span className="text-[#8C6218]">*</span>
                          </label>
                          <input
                            id="moon-airline-name"
                            type="text"
                            enterKeyHint="done"
                            required
                            maxLength={MOON_EVENT_LIMITS.airlineNameMax}
                            value={airlineName}
                            onChange={(e) => setAirlineName(e.target.value)}
                            placeholder="Contoh: Nusantara Sky Airlines"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-[#D4AF37] focus:outline-none"
                          />
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Tulis persis sesuai nama maskapai di dalam game.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="moon-alliance"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Alliance <span className="text-[#8C6218]">*</span>
                          </label>
                          <input
                            id="moon-alliance"
                            type="text"
                            enterKeyHint="done"
                            required
                            maxLength={MOON_EVENT_LIMITS.allianceMax}
                            value={alliance}
                            onChange={(e) => setAlliance(e.target.value)}
                            placeholder="Contoh: Nusantara Alliance"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors focus:border-[#D4AF37] focus:outline-none"
                          />
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Isi nama aliansi tempat maskapaimu bernaung.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Group 02: Data Keuangan */}
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2.5">
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-mono text-xs font-semibold text-[#8C6218]">
                            02.
                          </span>
                          <h3 className="font-display text-sm font-semibold text-slate-950">
                            Statistik Keuangan Maskapai
                          </h3>
                        </div>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {liveFinancialPreview.filledCount}/5 angka terisi
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label
                            htmlFor="moon-total-profit"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Total Profit <span className="text-[#8C6218]">*</span>
                          </label>
                          <input
                            id="moon-total-profit"
                            type="number"
                            enterKeyHint="done"
                            step="any"
                            required
                            value={totalProfit}
                            onChange={(e) => setTotalProfit(e.target.value)}
                            placeholder="0"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm font-semibold text-slate-900 tabular-nums placeholder:text-slate-400 shadow-sm transition-colors focus:border-[#D4AF37] focus:outline-none"
                          />
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Total laba bersih sesuai halaman profit game.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="moon-codeshare-profit"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Codeshare Profit{' '}
                            <span className="text-[#8C6218]">*</span>
                          </label>
                          <input
                            id="moon-codeshare-profit"
                            type="number"
                            enterKeyHint="done"
                            step="any"
                            required
                            value={codeshareProfit}
                            onChange={(e) => setCodeshareProfit(e.target.value)}
                            placeholder="0"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 shadow-sm transition-colors focus:border-[#D4AF37] focus:outline-none"
                          />
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Keuntungan dari rute kerja sama codeshare aliansi.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="moon-operating-profit"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Operating Profit{' '}
                            <span className="text-[#8C6218]">*</span>
                          </label>
                          <input
                            id="moon-operating-profit"
                            type="number"
                            enterKeyHint="done"
                            step="any"
                            required
                            value={operatingProfit}
                            onChange={(e) => setOperatingProfit(e.target.value)}
                            placeholder="0"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 shadow-sm transition-colors focus:border-[#D4AF37] focus:outline-none"
                          />
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Laba operasional penerbangan maskapai.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="moon-revenue"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Revenue <span className="text-[#8C6218]">*</span>
                          </label>
                          <input
                            id="moon-revenue"
                            type="number"
                            enterKeyHint="done"
                            step="any"
                            min="0"
                            required
                            value={revenue}
                            onChange={(e) => setRevenue(e.target.value)}
                            placeholder="0"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 shadow-sm transition-colors focus:border-[#D4AF37] focus:outline-none"
                          />
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Total pemasukan kotor maskapai (minimal 0).
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="moon-operating-cost"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Operating Cost{' '}
                            <span className="text-[#8C6218]">*</span>
                          </label>
                          <input
                            id="moon-operating-cost"
                            type="number"
                            enterKeyHint="done"
                            step="any"
                            min="0"
                            required
                            value={operatingCost}
                            onChange={(e) => setOperatingCost(e.target.value)}
                            placeholder="0"
                            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums placeholder:text-slate-400 shadow-sm transition-colors focus:border-[#D4AF37] focus:outline-none"
                          />
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Total biaya operasional penerbangan (minimal 0).
                          </p>
                        </div>

                        {/* Live Margin Readout */}
                        <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              Ringkasan Otomatis
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              Pemeriksaan cepat angka sebelum dikirim.
                            </p>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                            <div>
                              <p className="text-[11px] text-slate-500">
                                Total Profit
                              </p>
                              <p className="font-mono text-xs font-bold text-slate-950 tabular-nums truncate">
                                {liveFinancialPreview.tp !== null
                                   ? liveFinancialPreview.tp.toLocaleString('id-ID')
                                  : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-500">
                                Estimasi Margin
                              </p>
                              <p className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                                {liveFinancialPreview.marginPct !== null
                                  ? `${liveFinancialPreview.marginPct.toFixed(1)}%`
                                  : '—'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Group 03: Real Photo File Uploads */}
                    <div className="space-y-5">
                      <div className="flex items-baseline gap-2.5 border-b border-slate-200 pb-2.5">
                        <span className="font-mono text-xs font-semibold text-[#8C6218]">
                          03.
                        </span>
                        <h3 className="font-display text-sm font-semibold text-slate-950">
                          Lampiran 2 Foto Bukti Asli dari Game
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {/* Foto profit maskapai */}
                        <div id="aotm-profit-photo-box">
                          <label
                            htmlFor="moon-profit-photo"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Foto Profit Maskapai (Screenshot Asli){' '}
                            <span className="text-[#8C6218]">*</span>
                          </label>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            Tangkapan layar asli halaman laporan profit
                            maskapai (JPG, PNG, atau WebP).
                          </p>

                          <input
                            id="moon-profit-photo"
                            type="file"
                            accept="image/*"
                            onChange={(e) => handlePhotoUpload(e, 'profit')}
                            className="sr-only"
                          />

                          {profitPhoto ? (
                            <div className="mt-3 space-y-2">
                              <div className="relative h-48 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                <img
                                  src={profitPhoto.dataUrl}
                                  alt="Pratinjau foto profit maskapai"
                                  className="h-full w-full object-contain"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                <span className="truncate font-mono">
                                  {profitPhoto.width}×{profitPhoto.height}px ·{' '}
                                  {profitPhoto.sizeKB} KB
                                </span>
                                <label
                                  htmlFor="moon-profit-photo"
                                  className="cursor-pointer font-semibold text-[#8C6218] hover:underline"
                                >
                                  Ganti Foto
                                </label>
                              </div>
                            </div>
                          ) : (
                            <label
                              htmlFor="moon-profit-photo"
                              className="mt-3 flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center transition-colors hover:border-[#D4AF37] hover:bg-slate-100"
                            >
                              <ImagePlus className="h-6 w-6 text-slate-400" />
                              <span className="text-xs font-semibold text-slate-800">
                                {compressingTarget === 'profit'
                                  ? 'Memproses foto...'
                                  : 'Pilih Screenshot Profit Maskapai'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Klik untuk memilih file dari perangkatmu
                              </span>
                            </label>
                          )}
                        </div>

                        {/* Foto maskapai */}
                        <div id="aotm-airline-photo-box">
                          <label
                            htmlFor="moon-airline-photo"
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Foto Maskapai (Screenshot Profil / Armada){' '}
                            <span className="text-[#8C6218]">*</span>
                          </label>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            Foto asli halaman profil atau armada maskapai di
                            dalam game (JPG, PNG, atau WebP).
                          </p>

                          <input
                            id="moon-airline-photo"
                            type="file"
                            accept="image/*"
                            onChange={(e) => handlePhotoUpload(e, 'airline')}
                            className="sr-only"
                          />

                          {airlinePhoto ? (
                            <div className="mt-3 space-y-2">
                              <div className="relative h-48 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                <img
                                  src={airlinePhoto.dataUrl}
                                  alt="Pratinjau foto maskapai"
                                  className="h-full w-full object-contain"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                <span className="truncate font-mono">
                                  {airlinePhoto.width}×{airlinePhoto.height}px ·{' '}
                                  {airlinePhoto.sizeKB} KB
                                </span>
                                <label
                                  htmlFor="moon-airline-photo"
                                  className="cursor-pointer font-semibold text-[#8C6218] hover:underline"
                                >
                                  Ganti Foto
                                </label>
                              </div>
                            </div>
                          ) : (
                            <label
                              htmlFor="moon-airline-photo"
                              className="mt-3 flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center transition-colors hover:border-[#D4AF37] hover:bg-slate-100"
                            >
                              <ImagePlus className="h-6 w-6 text-slate-400" />
                              <span className="text-xs font-semibold text-slate-800">
                                {compressingTarget === 'airline'
                                  ? 'Memproses foto...'
                                  : 'Pilih Screenshot Profil Maskapai'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Klik untuk memilih file dari perangkatmu
                              </span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    {formError && (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
                        {formError}
                      </p>
                    )}

                    <div className="flex flex-col items-start justify-between gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center">
                      <p className="text-xs text-slate-600">
                        Pastikan seluruh angka dan kedua foto sudah benar sebelum
                        mengirim.
                      </p>
                      <button
                        id="moon-submit-btn"
                        type="submit"
                        disabled={submitting || compressingTarget !== null}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-6 py-3 text-sm font-semibold text-[#080E18] transition-colors hover:bg-[#E5C158] disabled:opacity-60 sm:w-auto whitespace-nowrap"
                      >
                        <Upload className="h-4 w-4" />
                        {submitting
                          ? 'Mengirim Laporan...'
                          : 'Kirim Data AOTM Nusantara Alliance'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strictly Admin-Only Private Evaluation & Screenshot Vault */}
      {isAdmin && (
        <AdminEvaluationVault
          submissions={submissions}
          loading={loadingSubmissions}
          adminError={adminError}
          activePhase={activePhase}
          onError={setAdminError}
        />
      )}

      {/* Floating Scroll Fire Follower (follows down when scrolling and fades out) */}
      {(() => {
        const showScrollFireFollower = scrollY > 70 && scrollY < 900;
        const scrollOpacity = Math.max(0, Math.min(1, 1 - (scrollY - 150) / 600));
        if (!showScrollFireFollower) return null;
        return (
          <div
            className="fixed bottom-6 right-6 z-50 pointer-events-none hidden sm:flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md transition-opacity duration-300"
            style={{
              opacity: scrollOpacity,
              borderColor:
                resolvedFireMode === 'blue'
                  ? 'rgba(0, 213, 255, 0.45)'
                  : 'rgba(255, 85, 0, 0.45)',
              backgroundColor:
                resolvedFireMode === 'blue'
                  ? 'rgba(8, 14, 24, 0.9)'
                  : 'rgba(13, 15, 20, 0.9)',
            }}
          >
            <span className="relative flex h-3 w-3">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  resolvedFireMode === 'blue' ? 'bg-cyan-400' : 'bg-orange-500'
                }`}
              />
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  resolvedFireMode === 'blue' ? 'bg-cyan-500' : 'bg-orange-600'
                }`}
              />
            </span>
            <div className="text-left">
              <p className="font-display text-xs font-bold text-white">
                {resolvedFireMode === 'blue'
                  ? '🔥 Blue Flame Berkobar'
                  : '🔥 Red Fire Berkobar'}
              </p>
              <p className="text-[10px] text-slate-400">
                Mengikuti guliran halaman...
              </p>
            </div>
          </div>
        );
      })()}

    </section>
  );
}

