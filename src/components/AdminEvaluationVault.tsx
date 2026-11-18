import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  ArrowLeftRight,
  Award,
  Bot,
  Camera,
  Check,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Megaphone,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import {
  ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  JUDGE_STATUS_OPTIONS,
  MOON_EVENT_LIMITS,
  type AotmEventPhase,
  type JudgeStatus,
  type MoonEventSubmission,
} from '../types/moonEvent';
import { exportLeaderboardPng } from '../utils/leaderboardExport';

interface AdminEvaluationVaultProps {
  submissions: MoonEventSubmission[];
  loading: boolean;
  adminError: string;
  activePhase: AotmEventPhase;
  onError: (msg: string) => void;
}

type AdminTab = 'list' | 'leaderboard' | 'compare';
type SortKey =
  | 'totalProfit'
  | 'operatingProfit'
  | 'codeshareProfit'
  | 'revenue'
  | 'margin'
  | 'adminScore'
  | 'newest';

const SORT_LABELS: Record<SortKey, string> = {
  adminScore: 'Klasemen Poin Akhir (Tertinggi)',
  totalProfit: 'Total Profit Tertinggi',
  operatingProfit: 'Operating Profit Tertinggi',
  codeshareProfit: 'Codeshare Profit Tertinggi',
  revenue: 'Revenue Tertinggi',
  margin: 'Profit Margin % Tertinggi',
  newest: 'Terbaru Dikirim',
};

function isAlreadyEvaluated(item: MoonEventSubmission): boolean {
  return (
    typeof item.adminScore === 'number' ||
    (Boolean(item.judgeStatus) && item.judgeStatus !== 'Menunggu')
  );
}

function mapAiToJudgeStatus(
  recommendedStatus?: JudgeStatus,
  photoMatchStatus?: string
): JudgeStatus {
  if (recommendedStatus === 'Diskualifikasi') return 'Diskualifikasi';
  if (
    photoMatchStatus === 'Tidak Sesuai' ||
    photoMatchStatus === 'Perlu Cek Manual' ||
    recommendedStatus === 'Menunggu'
  ) {
    return 'Menunggu';
  }
  return 'Terverifikasi';
}

function formatMetric(val: number): string {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 2,
  }).format(val);
}

function calcMarginPct(item: MoonEventSubmission): number {
  if (!item.revenue || item.revenue <= 0) return 0;
  return (item.operatingProfit / item.revenue) * 100;
}

function computeExpectedPodiumUpdates(
  itemsSnapshot: MoonEventSubmission[]
): Array<{ item: MoonEventSubmission; nextStatus: JudgeStatus }> {
  const scoredValid = itemsSnapshot
    .filter(
      (item) =>
        item.judgeStatus !== 'Diskualifikasi' &&
        item.judgeStatus !== 'Menunggu' &&
        typeof item.adminScore === 'number'
    )
    .sort((a, b) => {
      if ((b.adminScore ?? 0) !== (a.adminScore ?? 0)) {
        return (b.adminScore ?? 0) - (a.adminScore ?? 0);
      }
      if (b.totalProfit !== a.totalProfit) {
        return b.totalProfit - a.totalProfit;
      }
      const bMargin = calcMarginPct(b);
      const aMargin = calcMarginPct(a);
      if (bMargin !== aMargin) {
        return bMargin - aMargin;
      }
      return b.operatingProfit - a.operatingProfit;
    });

  const updates: Array<{ item: MoonEventSubmission; nextStatus: JudgeStatus }> = [];
  for (let idx = 0; idx < scoredValid.length; idx += 1) {
    const item = scoredValid[idx];
    const nextStatus: JudgeStatus =
      idx === 0
        ? 'Juara 1'
        : idx === 1
          ? 'Juara 2'
          : idx === 2
            ? 'Juara 3'
            : 'Terverifikasi';
    if (item.judgeStatus !== nextStatus) {
      updates.push({ item, nextStatus });
    }
  }
  return updates;
}

function getStatusTextClass(status?: JudgeStatus): string {
  switch (status) {
    case 'Juara 1':
    case 'Juara 2':
    case 'Juara 3':
      return 'text-[#F3D77A]';
    case 'Terverifikasi':
      return 'text-emerald-300';
    case 'Diskualifikasi':
      return 'text-rose-300';
    default:
      return 'text-slate-300';
  }
}

export function AdminEvaluationVault({
  submissions,
  loading,
  adminError,
  activePhase,
  onError,
}: AdminEvaluationVaultProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('adminScore');
  const [statusFilter, setStatusFilter] = useState<'ALL' | JudgeStatus>('ALL');

  // Clean screenshot toggles
  const [leaderboardCleanSS, setLeaderboardCleanSS] = useState(false);
  const [compareCleanSS, setCompareCleanSS] = useState(false);
  const [cardCleanSS, setCardCleanSS] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);

  // Selected card for judging + screenshot
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<JudgeStatus>('Menunggu');
  const [editScore, setEditScore] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Compare two airlines state
  const [compareLeftId, setCompareLeftId] = useState<string>('');
  const [compareRightId, setCompareRightId] = useState<string>('');

  // High-res lightbox & delete confirm
  const [lightboxImage, setLightboxImage] = useState<{
    title: string;
    src: string;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // AI Auto-Evaluation state
  const [aiEvaluatingSingle, setAiEvaluatingSingle] = useState(false);
  const [aiSingleFeedback, setAiSingleFeedback] = useState<{
    photoMatchStatus: string;
    score: number;
    recommendedStatus: JudgeStatus;
  } | null>(null);
  const [aiBatchProgress, setAiBatchProgress] = useState<{
    current: number;
    total: number;
    airlineName: string;
  } | null>(null);
  const [aiBatchDoneMsg, setAiBatchDoneMsg] = useState('');
  const [publishingWinners, setPublishingWinners] = useState(false);
  const [publishDoneMsg, setPublishDoneMsg] = useState('');

  // Autonomous Offline AI Auto-Pilot state
  const [autoPilotEnabled, setAutoPilotEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('aotm_autopilot_ai_v1');
      return saved === null ? true : saved === '1';
    } catch {
      return true;
    }
  });
  const [autoPublishAtAnnouncement, setAutoPublishAtAnnouncement] =
    useState<boolean>(() => {
      try {
        const saved = window.localStorage.getItem('aotm_autopublish_v1');
        return saved === null ? true : saved === '1';
      } catch {
        return true;
      }
    });
  const [autoPilotRunning, setAutoPilotRunning] = useState(false);
  const [autoPilotInfo, setAutoPilotInfo] = useState('');
  const autoPilotBusyRef = useRef(false);
  const autoAttemptedIdsRef = useRef<Set<string>>(new Set());
  const lastPublishedDigestRef = useRef<string>('');

  const sortedAndFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = submissions.filter((item) => {
      const matchesSearch =
        !q ||
        item.airlineName.toLowerCase().includes(q) ||
        item.alliance.toLowerCase().includes(q) ||
        item.submittedByEmail.toLowerCase().includes(q);
      const currentStatus: JudgeStatus = item.judgeStatus || 'Menunggu';
      const matchesStatus =
        statusFilter === 'ALL' || currentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'adminScore': {
          const aDisq = a.judgeStatus === 'Diskualifikasi';
          const bDisq = b.judgeStatus === 'Diskualifikasi';
          if (aDisq !== bDisq) return aDisq ? 1 : -1;

          const aHasScore = typeof a.adminScore === 'number';
          const bHasScore = typeof b.adminScore === 'number';
          if (aHasScore !== bHasScore) return bHasScore ? 1 : -1;

          if (aHasScore && bHasScore && b.adminScore !== a.adminScore) {
            return (b.adminScore ?? 0) - (a.adminScore ?? 0);
          }
          if (b.totalProfit !== a.totalProfit) {
            return b.totalProfit - a.totalProfit;
          }
          return b.operatingProfit - a.operatingProfit;
        }
        case 'totalProfit':
          return b.totalProfit - a.totalProfit;
        case 'operatingProfit':
          return b.operatingProfit - a.operatingProfit;
        case 'codeshareProfit':
          return b.codeshareProfit - a.codeshareProfit;
        case 'revenue':
          return b.revenue - a.revenue;
        case 'margin':
          return calcMarginPct(b) - calcMarginPct(a);
        case 'newest': {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        }
      }
    });
    return sorted;
  }, [submissions, searchQuery, statusFilter, sortBy]);

  const unjudgedCount = useMemo(
    () => submissions.filter((item) => !isAlreadyEvaluated(item)).length,
    [submissions]
  );

  const rankedForLeaderboard = useMemo(() => {
    return sortedAndFiltered.filter(
      (item) => item.judgeStatus !== 'Diskualifikasi'
    );
  }, [sortedAndFiltered]);

  const selectedSubmission = useMemo(() => {
    if (!selectedId) return null;
    return submissions.find((s) => s.id === selectedId) || null;
  }, [submissions, selectedId]);

  const selectedRank = useMemo(() => {
    if (!selectedSubmission) return null;
    const idx = sortedAndFiltered.findIndex(
      (s) => s.id === selectedSubmission.id
    );
    return idx >= 0 ? idx + 1 : null;
  }, [sortedAndFiltered, selectedSubmission]);

  const kpiSummary = useMemo(() => {
    const verifiedCount = submissions.filter(
      (s) =>
        s.judgeStatus === 'Terverifikasi' ||
        s.judgeStatus === 'Juara 1' ||
        s.judgeStatus === 'Juara 2' ||
        s.judgeStatus === 'Juara 3'
    ).length;

    const topProfitItem =
      submissions.length > 0
        ? [...submissions].sort((a, b) => b.totalProfit - a.totalProfit)[0]
        : null;

    const totalRevenueSum = submissions.reduce(
      (acc, cur) => acc + (Number.isFinite(cur.revenue) ? cur.revenue : 0),
      0
    );

    return { verifiedCount, topProfitItem, totalRevenueSum };
  }, [submissions]);

  const topOneRecommendation = useMemo(() => {
    if (submissions.length === 0) return null;

    const nonDisqualified = submissions.filter(
      (s) => s.judgeStatus !== 'Diskualifikasi'
    );
    if (nonDisqualified.length === 0) return null;

    const verifiedOnly = nonDisqualified.filter(
      (s) => s.judgeStatus !== 'Menunggu' && s.judgeStatus !== undefined
    );
    const pool = verifiedOnly.length > 0 ? verifiedOnly : nonDisqualified;

    const scoredPool = [...pool].sort((a, b) => {
      const aHasScore = typeof a.adminScore === 'number';
      const bHasScore = typeof b.adminScore === 'number';
      if (aHasScore !== bHasScore) return bHasScore ? 1 : -1;
      if (aHasScore && bHasScore && b.adminScore !== a.adminScore) {
        return (b.adminScore ?? 0) - (a.adminScore ?? 0);
      }
      if (b.totalProfit !== a.totalProfit) {
        return b.totalProfit - a.totalProfit;
      }
      const bMargin = calcMarginPct(b);
      const aMargin = calcMarginPct(a);
      if (bMargin !== aMargin) return bMargin - aMargin;
      return b.operatingProfit - a.operatingProfit;
    });

    const candidate = scoredPool[0];
    if (!candidate) return null;

    const hasValidFiveMetrics =
      Number.isFinite(candidate.totalProfit) &&
      Number.isFinite(candidate.codeshareProfit) &&
      Number.isFinite(candidate.operatingProfit) &&
      Number.isFinite(candidate.revenue) &&
      candidate.revenue >= 0 &&
      Number.isFinite(candidate.operatingCost) &&
      candidate.operatingCost >= 0;

    const hasBothPhotos =
      Boolean(candidate.profitPhotoDataUrl) &&
      Boolean(candidate.airlinePhotoDataUrl);

    const isVerifiedClean =
      candidate.judgeStatus === 'Juara 1' ||
      candidate.judgeStatus === 'Terverifikasi' ||
      candidate.judgeStatus === 'Juara 2' ||
      candidate.judgeStatus === 'Juara 3';

    return {
      candidate,
      marginPct: calcMarginPct(candidate),
      hasValidFiveMetrics,
      hasBothPhotos,
      isVerifiedClean,
      aiEvaluated: isAlreadyEvaluated(candidate),
    };
  }, [submissions]);

  const compareLeft = useMemo(() => {
    return (
      submissions.find((s) => s.id === compareLeftId) ||
      sortedAndFiltered[0] ||
      null
    );
  }, [submissions, sortedAndFiltered, compareLeftId]);

  const compareRight = useMemo(() => {
    return (
      submissions.find((s) => s.id === compareRightId) ||
      sortedAndFiltered[1] ||
      sortedAndFiltered[0] ||
      null
    );
  }, [submissions, sortedAndFiltered, compareRightId]);

  const openJudgingCard = (item: MoonEventSubmission) => {
    setSelectedId(item.id);
    setEditStatus(item.judgeStatus || 'Menunggu');
    setEditScore(
      typeof item.adminScore === 'number' ? String(item.adminScore) : ''
    );
    setEditNote(item.adminNote || '');
    setSavedNotice(false);
    setCardCleanSS(false);
    setAiSingleFeedback(null);
  };

  const syncPodiumStandings = useCallback(
    async (itemsSnapshot: MoonEventSubmission[]): Promise<void> => {
      const updates = computeExpectedPodiumUpdates(itemsSnapshot);
      for (const { item, nextStatus } of updates) {
        const docPath = `moonEventSubmissions/${item.id}`;
        try {
          await updateDoc(doc(db, 'moonEventSubmissions', item.id), {
            judgeStatus: nextStatus,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          onError('Gagal menyesuaikan peringkat klasemen.');
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        }
      }
    },
    [onError]
  );

  const handleSaveEvaluation = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSubmission) return;

    const trimmedNote = editNote.trim();
    if (trimmedNote.length > MOON_EVENT_LIMITS.adminNoteMax) {
      onError(
        `Catatan penilaian maksimal ${MOON_EVENT_LIMITS.adminNoteMax} karakter.`
      );
      return;
    }

    let parsedScore: number | undefined;
    if (editScore.trim() !== '') {
      const num = Number(editScore.trim());
      if (
        !Number.isFinite(num) ||
        num < MOON_EVENT_LIMITS.adminScoreMin ||
        num > MOON_EVENT_LIMITS.adminScoreMax
      ) {
        onError(
          `Nilai juri harus angka antara ${MOON_EVENT_LIMITS.adminScoreMin} hingga ${MOON_EVENT_LIMITS.adminScoreMax}.`
        );
        return;
      }
      parsedScore = Math.round(num * 100) / 100;
    }

    setSavingEvaluation(true);
    setSavedNotice(false);
    const docPath = `moonEventSubmissions/${selectedSubmission.id}`;
    try {
      const updatePayload: Record<string, unknown> = {
        judgeStatus: editStatus,
        adminNote: trimmedNote,
        updatedAt: serverTimestamp(),
      };
      if (parsedScore !== undefined) {
        updatePayload.adminScore = parsedScore;
      }

      await updateDoc(
        doc(db, 'moonEventSubmissions', selectedSubmission.id),
        updatePayload
      );

      // Automatically sync klasemen ranks if a final score is set and not disqualified
      if (parsedScore !== undefined && editStatus !== 'Diskualifikasi') {
        const updatedSnapshot = submissions.map((s) =>
          s.id === selectedSubmission.id
            ? {
                ...s,
                judgeStatus: editStatus,
                adminScore: parsedScore,
                adminNote: trimmedNote,
              }
            : s
        );
        await syncPodiumStandings(updatedSnapshot);
      }

      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      onError('Gagal menyimpan hasil penilaian admin.');
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    } finally {
      setSavingEvaluation(false);
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    setDeletingId(submissionId);
    const docPath = `moonEventSubmissions/${submissionId}`;
    try {
      await deleteDoc(doc(db, 'moonEventSubmissions', submissionId));
      if (selectedId === submissionId) {
        setSelectedId(null);
      }
      setConfirmDeleteId(null);
    } catch (err) {
      onError('Gagal menghapus data peserta.');
      handleFirestoreError(err, OperationType.DELETE, docPath);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadLeaderboardPng = async () => {
    setExportingPng(true);
    try {
      await exportLeaderboardPng(rankedForLeaderboard, SORT_LABELS[sortBy]);
    } finally {
      setExportingPng(false);
    }
  };

  const buildPeerStats = (item: MoonEventSubmission) => {
    const byProfit = [...submissions].sort(
      (a, b) => b.totalProfit - a.totalProfit
    );
    const byOpProfit = [...submissions].sort(
      (a, b) => b.operatingProfit - a.operatingProfit
    );
    const byMargin = [...submissions].sort(
      (a, b) => calcMarginPct(b) - calcMarginPct(a)
    );

    const profitRankIdx = byProfit.findIndex((s) => s.id === item.id);
    const marginRankIdx = byMargin.findIndex((s) => s.id === item.id);

    return {
      totalParticipants: submissions.length,
      maxTotalProfit: byProfit[0]?.totalProfit ?? item.totalProfit,
      maxOperatingProfit: byOpProfit[0]?.operatingProfit ?? item.operatingProfit,
      maxMarginPct: byMargin[0] ? calcMarginPct(byMargin[0]) : calcMarginPct(item),
      rankByTotalProfit: profitRankIdx >= 0 ? profitRankIdx + 1 : 1,
      rankByMargin: marginRankIdx >= 0 ? marginRankIdx + 1 : 1,
    };
  };

  const requestAiEvaluation = async (
    item: MoonEventSubmission,
    peerStats: {
      totalParticipants: number;
      maxTotalProfit: number;
      maxOperatingProfit: number;
      maxMarginPct: number;
      rankByTotalProfit: number;
      rankByMargin: number;
    }
  ): Promise<{
    score: number;
    recommendedStatus: JudgeStatus;
    photoMatchStatus: string;
    top1Eligible: boolean;
    summaryNote: string;
  }> => {
    const response = await fetch('/api/ai/evaluate-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        airlineName: item.airlineName,
        alliance: item.alliance,
        totalProfit: item.totalProfit,
        codeshareProfit: item.codeshareProfit,
        operatingProfit: item.operatingProfit,
        revenue: item.revenue,
        operatingCost: item.operatingCost,
        profitPhotoDataUrl: item.profitPhotoDataUrl,
        airlinePhotoDataUrl: item.airlinePhotoDataUrl,
        peerStats,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(
        'Endpoint AI tidak merespons JSON. Jika membuka dari Netlify, pastikan GEMINI_API_KEY sudah dipasang di Netlify Environment Variables, atau jalankan penilaian AI melalui URL AI Studio.'
      );
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data?.error || 'Gagal menjalankan penilaian AI pada server.'
      );
    }
    return {
      score: Number(data.score),
      recommendedStatus: (JUDGE_STATUS_OPTIONS.includes(data.recommendedStatus)
        ? data.recommendedStatus
        : 'Terverifikasi') as JudgeStatus,
      photoMatchStatus: String(data.photoMatchStatus || 'Perlu Cek Manual'),
      top1Eligible: data.top1Eligible === true,
      summaryNote: String(data.summaryNote || '').slice(
        0,
        MOON_EVENT_LIMITS.adminNoteMax
      ),
    };
  };

  const handleAiEvaluateSingle = async () => {
    if (!selectedSubmission) return;
    setAiEvaluatingSingle(true);
    setAiSingleFeedback(null);
    onError('');

    try {
      const result = await requestAiEvaluation(
        selectedSubmission,
        buildPeerStats(selectedSubmission)
      );

      setEditScore(String(result.score));
      setEditStatus(result.recommendedStatus);
      setEditNote(result.summaryNote);
      setAiSingleFeedback({
        photoMatchStatus: result.photoMatchStatus,
        score: result.score,
        recommendedStatus: result.recommendedStatus,
      });
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : 'Gagal menjalankan penilaian AI.'
      );
    } finally {
      setAiEvaluatingSingle(false);
    }
  };

  const verifySignedAiPreEvaluations = useCallback(
    async (
      candidates: MoonEventSubmission[]
    ): Promise<{ verifiedSet: Set<string>; failed: boolean }> => {
      const withSig = candidates.filter(
        (c) =>
          typeof c.aiScore === 'number' &&
          typeof c.aiSignature === 'string' &&
          /^[a-f0-9]{64}$/.test(c.aiSignature)
      );
      if (withSig.length === 0) {
        return { verifiedSet: new Set<string>(), failed: false };
      }

      try {
        const res = await fetch('/api/ai/verify-submission-eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: withSig.map((c) => ({
              id: c.id,
              airlineName: c.airlineName,
              alliance: c.alliance,
              totalProfit: c.totalProfit,
              codeshareProfit: c.codeshareProfit,
              operatingProfit: c.operatingProfit,
              revenue: c.revenue,
              operatingCost: c.operatingCost,
              aiScore: c.aiScore,
              aiRecommendedStatus: c.aiRecommendedStatus,
              aiPhotoMatchStatus: c.aiPhotoMatchStatus,
              aiTop1Eligible: c.aiTop1Eligible,
              aiSummaryNote: c.aiSummaryNote,
              aiSignature: c.aiSignature,
            })),
          }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) {
          return { verifiedSet: new Set<string>(), failed: true };
        }
        const data = (await res.json()) as { verifiedIds?: unknown };
        const verifiedIds = Array.isArray(data.verifiedIds)
          ? data.verifiedIds.map(String)
          : [];
        return { verifiedSet: new Set(verifiedIds), failed: false };
      } catch {
        return { verifiedSet: new Set<string>(), failed: true };
      }
    },
    []
  );

  const handleAiBatchEvaluate = async () => {
    if (submissions.length === 0 || aiBatchProgress) return;
    onError('');
    setAiBatchDoneMsg('');
    autoAttemptedIdsRef.current.clear();

    const byProfit = [...submissions].sort(
      (a, b) => b.totalProfit - a.totalProfit
    );

    // Skip any airline that has already been graded/scored
    const unjudgedItems = byProfit.filter((item) => !isAlreadyEvaluated(item));

    if (unjudgedItems.length === 0) {
      await syncPodiumStandings(submissions);
      setSortBy('adminScore');
      setAiBatchDoneMsg(
        'Semua maskapai sudah memiliki nilai. Peringkat Juara 1–3 sudah disesuaikan otomatis berdasarkan poin akhir & 3 kriteria juri.'
      );
      window.setTimeout(() => setAiBatchDoneMsg(''), 6000);
      return;
    }

    const updatedMap = new Map<string, MoonEventSubmission>(
      submissions.map((s) => [s.id, s])
    );

    let successCount = 0;
    let failedCount = 0;
    let firstErrorMsg = '';

    try {
      // First promote any pre-evaluated submissions that already have valid server HMAC signatures
      const { verifiedSet } = await verifySignedAiPreEvaluations(unjudgedItems);
      const remainingForAi: MoonEventSubmission[] = [];

      for (const item of unjudgedItems) {
        if (verifiedSet.has(item.id) && typeof item.aiScore === 'number') {
          const initialStatus = mapAiToJudgeStatus(
            item.aiRecommendedStatus,
            item.aiPhotoMatchStatus
          );
          const note = (item.aiSummaryNote || '').slice(
            0,
            MOON_EVENT_LIMITS.adminNoteMax
          );
          const docPath = `moonEventSubmissions/${item.id}`;
          try {
            await updateDoc(doc(db, 'moonEventSubmissions', item.id), {
              judgeStatus: initialStatus,
              adminScore: item.aiScore,
              adminNote: note,
              updatedAt: serverTimestamp(),
            });
            updatedMap.set(item.id, {
              ...item,
              judgeStatus: initialStatus,
              adminScore: item.aiScore,
              adminNote: note,
            });
            successCount += 1;
          } catch (err) {
            onError('Gagal menyimpan hasil pra-evaluasi AI ke database.');
            handleFirestoreError(err, OperationType.UPDATE, docPath);
          }
        } else {
          remainingForAi.push(item);
        }
      }

      for (let i = 0; i < remainingForAi.length; i += 1) {
        const item = remainingForAi[i];

        setAiBatchProgress({
          current: i + 1,
          total: remainingForAi.length,
          airlineName: item.airlineName,
        });

        try {
          const result = await requestAiEvaluation(item, buildPeerStats(item));
          const initialStatus = mapAiToJudgeStatus(
            result.recommendedStatus,
            result.photoMatchStatus
          );

          const docPath = `moonEventSubmissions/${item.id}`;
          try {
            await updateDoc(doc(db, 'moonEventSubmissions', item.id), {
              judgeStatus: initialStatus,
              adminScore: result.score,
              adminNote: result.summaryNote,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            onError('Gagal menyimpan hasil penilaian AI ke database.');
            handleFirestoreError(err, OperationType.UPDATE, docPath);
          }

          updatedMap.set(item.id, {
            ...item,
            judgeStatus: initialStatus,
            adminScore: result.score,
            adminNote: result.summaryNote,
          });
          successCount += 1;
        } catch (itemErr) {
          failedCount += 1;
          if (!firstErrorMsg) {
            firstErrorMsg =
              itemErr instanceof Error
                ? itemErr.message
                : 'Gagal menilai salah satu maskapai.';
          }
          if (
            firstErrorMsg.includes('GEMINI_API_KEY') ||
            firstErrorMsg.includes('Endpoint AI')
          ) {
            throw new Error(firstErrorMsg);
          }
        }

        if (i < remainingForAi.length - 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      if (successCount > 0) {
        await syncPodiumStandings(Array.from(updatedMap.values()));
        setSortBy('adminScore');
      }

      if (failedCount > 0) {
        onError(
          `${successCount} maskapai dinilai, ${failedCount} gagal (${firstErrorMsg}).`
        );
      } else {
        setAiBatchDoneMsg(
          `${successCount} maskapai selesai dinilai AI & langsung diurutkan otomatis sesuai poin akhir.`
        );
        window.setTimeout(() => setAiBatchDoneMsg(''), 7000);
      }
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : 'Gagal menyelesaikan penilaian otomatis AI.'
      );
    } finally {
      setAiBatchProgress(null);
    }
  };

  const handlePublishTopTenWinners = useCallback(async () => {
    if (submissions.length === 0 || publishingWinners) return;
    onError('');
    setPublishDoneMsg('');
    setPublishingWinners(true);

    try {
      const sortedTopTen = [...submissions]
        .filter((item) => item.judgeStatus !== 'Diskualifikasi')
        .sort((a, b) => {
          const aVerified = Boolean(a.judgeStatus && a.judgeStatus !== 'Menunggu');
          const bVerified = Boolean(b.judgeStatus && b.judgeStatus !== 'Menunggu');
          if (aVerified !== bVerified) return bVerified ? 1 : -1;

          const aHasScore = typeof a.adminScore === 'number';
          const bHasScore = typeof b.adminScore === 'number';
          if (aHasScore !== bHasScore) return bHasScore ? 1 : -1;
          if (aHasScore && bHasScore && b.adminScore !== a.adminScore) {
            return (b.adminScore ?? 0) - (a.adminScore ?? 0);
          }
          if (b.totalProfit !== a.totalProfit) {
            return b.totalProfit - a.totalProfit;
          }
          const bMargin = calcMarginPct(b);
          const aMargin = calcMarginPct(a);
          if (bMargin !== aMargin) {
            return bMargin - aMargin;
          }
          return b.operatingProfit - a.operatingProfit;
        })
        .slice(0, 10);

      if (sortedTopTen.length === 0) {
        onError('Tidak ada peserta aktif yang dapat dipublikasikan ke Top 10.');
        return;
      }

      const colPath = 'aotmWinners';
      let existingIds = new Set<string>();
      try {
        const snap = await getDocs(collection(db, colPath));
        existingIds = new Set(snap.docs.map((d) => d.id));
      } catch (err) {
        onError('Gagal memeriksa daftar pemenang sebelumnya.');
        handleFirestoreError(err, OperationType.LIST, colPath);
      }

      const keptIds = new Set<string>();

      for (let i = 0; i < sortedTopTen.length; i += 1) {
        const item = sortedTopTen[i];
        const rank = i + 1;
        const winnerId = `top_${rank}`;
        keptIds.add(winnerId);

        const safeScore =
          typeof item.adminScore === 'number' &&
          Number.isFinite(item.adminScore)
            ? Math.min(100, Math.max(0, item.adminScore))
            : 0;
        const fallbackStatus =
          rank === 1
            ? 'Juara 1'
            : rank === 2
              ? 'Juara 2'
              : rank === 3
                ? 'Juara 3'
                : 'Terverifikasi';
        const safeStatus = (item.judgeStatus || fallbackStatus).slice(0, 40);

        const basePayload: Record<string, unknown> = {
          rank,
          airlineName: item.airlineName.slice(0, 100),
          alliance: item.alliance.slice(0, 100),
          adminScore: safeScore,
          judgeStatus: safeStatus,
          updatedAt: serverTimestamp(),
        };

        if (
          item.airlinePhotoDataUrl &&
          item.airlinePhotoDataUrl.startsWith('data:image/') &&
          item.airlinePhotoDataUrl.length >=
            MOON_EVENT_LIMITS.minPhotoDataUrlLength &&
          item.airlinePhotoDataUrl.length <=
            MOON_EVENT_LIMITS.maxPhotoDataUrlLength
        ) {
          basePayload.photoDataUrl = item.airlinePhotoDataUrl;
        }

        const docPath = `aotmWinners/${winnerId}`;
        try {
          if (existingIds.has(winnerId)) {
            await updateDoc(doc(db, 'aotmWinners', winnerId), basePayload);
          } else {
            await setDoc(doc(db, 'aotmWinners', winnerId), {
              ...basePayload,
              publishedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          onError(`Gagal mempublikasikan peringkat Top ${rank}.`);
          handleFirestoreError(
            err,
            existingIds.has(winnerId)
              ? OperationType.UPDATE
              : OperationType.CREATE,
            docPath
          );
        }
      }

      // Remove any leftover ranks if previously > current count
      for (const oldId of existingIds) {
        if (!keptIds.has(oldId)) {
          try {
            await deleteDoc(doc(db, 'aotmWinners', oldId));
          } catch (err) {
            handleFirestoreError(
              err,
              OperationType.DELETE,
              `aotmWinners/${oldId}`
            );
          }
        }
      }

      setPublishDoneMsg(
        `Top 1–${sortedTopTen.length} resmi dipublikasikan ke papan PENGUMUMAN PEMENANG AOTM NOVEMBER 2026 NUSANTARA ALLIANCE.`
      );
      window.setTimeout(() => setPublishDoneMsg(''), 6000);
    } finally {
      setPublishingWinners(false);
    }
  }, [submissions, publishingWinners, onError]);

  // Autonomous Auto-Pilot AI Effect:
  // 1) Instantly verifies & promotes AI pre-evaluations submitted while admin was offline
  // 2) Automatically calls Gemini AI for any unevaluated entries
  // 3) Automatically sorts & assigns Juara 1-3 + Terverifikasi by points
  // 4) Optionally auto-publishes Top 1-10 once event hits announcement phase
  useEffect(() => {
    if (
      !autoPilotEnabled ||
      loading ||
      submissions.length === 0 ||
      aiBatchProgress !== null ||
      publishingWinners ||
      autoPilotBusyRef.current
    ) {
      return;
    }

    const unevaluated = submissions.filter(
      (item) =>
        !isAlreadyEvaluated(item) && !autoAttemptedIdsRef.current.has(item.id)
    );
    const podiumUpdates = computeExpectedPodiumUpdates(submissions);

    if (unevaluated.length > 0 || podiumUpdates.length > 0) {
      let cancelled = false;
      autoPilotBusyRef.current = true;
      setAutoPilotRunning(true);

      const runCycle = async () => {
        try {
          const updatedMap = new Map<string, MoonEventSubmission>(
            submissions.map((s) => [s.id, s])
          );

          if (unevaluated.length > 0) {
            setAutoPilotInfo(
              `Auto-Pilot AI memverifikasi & menilai ${unevaluated.length} laporan masuk secara otomatis...`
            );
            const { verifiedSet } =
              await verifySignedAiPreEvaluations(unevaluated);
            const fallbackQueue: MoonEventSubmission[] = [];

            for (const item of unevaluated) {
              if (cancelled) break;
              autoAttemptedIdsRef.current.add(item.id);
              if (verifiedSet.has(item.id) && typeof item.aiScore === 'number') {
                const initialStatus = mapAiToJudgeStatus(
                  item.aiRecommendedStatus,
                  item.aiPhotoMatchStatus
                );
                const note = (item.aiSummaryNote || '').slice(
                  0,
                  MOON_EVENT_LIMITS.adminNoteMax
                );
                await updateDoc(doc(db, 'moonEventSubmissions', item.id), {
                  judgeStatus: initialStatus,
                  adminScore: item.aiScore,
                  adminNote: note,
                  updatedAt: serverTimestamp(),
                });
                updatedMap.set(item.id, {
                  ...item,
                  judgeStatus: initialStatus,
                  adminScore: item.aiScore,
                  adminNote: note,
                });
              } else {
                fallbackQueue.push(item);
              }
            }

            for (let i = 0; i < fallbackQueue.length; i += 1) {
              if (cancelled) break;
              const item = fallbackQueue[i];
              setAutoPilotInfo(
                `Auto-Pilot AI menilai otomatis ${item.airlineName} (${i + 1}/${fallbackQueue.length})...`
              );
              try {
                const allList = Array.from(updatedMap.values());
                const byProfit = [...allList].sort(
                  (a, b) => b.totalProfit - a.totalProfit
                );
                const byOp = [...allList].sort(
                  (a, b) => b.operatingProfit - a.operatingProfit
                );
                const byMargin = [...allList].sort(
                  (a, b) => calcMarginPct(b) - calcMarginPct(a)
                );
                const pIdx = byProfit.findIndex((s) => s.id === item.id);
                const mIdx = byMargin.findIndex((s) => s.id === item.id);

                const result = await requestAiEvaluation(item, {
                  totalParticipants: allList.length,
                  maxTotalProfit: byProfit[0]?.totalProfit ?? item.totalProfit,
                  maxOperatingProfit:
                    byOp[0]?.operatingProfit ?? item.operatingProfit,
                  maxMarginPct: byMargin[0]
                    ? calcMarginPct(byMargin[0])
                    : calcMarginPct(item),
                  rankByTotalProfit: pIdx >= 0 ? pIdx + 1 : 1,
                  rankByMargin: mIdx >= 0 ? mIdx + 1 : 1,
                });

                const initialStatus = mapAiToJudgeStatus(
                  result.recommendedStatus,
                  result.photoMatchStatus
                );
                await updateDoc(doc(db, 'moonEventSubmissions', item.id), {
                  judgeStatus: initialStatus,
                  adminScore: result.score,
                  adminNote: result.summaryNote,
                  updatedAt: serverTimestamp(),
                });
                updatedMap.set(item.id, {
                  ...item,
                  judgeStatus: initialStatus,
                  adminScore: result.score,
                  adminNote: result.summaryNote,
                });
              } catch {
                // Keep manual retry available without blocking remaining queue
              }
              if (i < fallbackQueue.length - 1) {
                await new Promise((r) => setTimeout(r, 350));
              }
            }
          }

          if (!cancelled) {
            await syncPodiumStandings(Array.from(updatedMap.values()));
            setSortBy('adminScore');
            setAutoPilotInfo(
              'Penilaian AI & pengurutan peringkat berdasarkan poin selesai otomatis.'
            );
          }
        } finally {
          autoPilotBusyRef.current = false;
          if (!cancelled) {
            setAutoPilotRunning(false);
          }
        }
      };

      void runCycle();
      return () => {
        cancelled = true;
      };
    }

    if (
      autoPublishAtAnnouncement &&
      activePhase === 'announcement' &&
      submissions.every(isAlreadyEvaluated)
    ) {
      const topDigest = [...submissions]
        .filter((s) => s.judgeStatus !== 'Diskualifikasi')
        .sort((a, b) => (b.adminScore ?? 0) - (a.adminScore ?? 0))
        .slice(0, 10)
        .map((s) => `${s.id}:${s.adminScore ?? 0}:${s.judgeStatus ?? ''}`)
        .join('|');

      if (topDigest && topDigest !== lastPublishedDigestRef.current) {
        lastPublishedDigestRef.current = topDigest;
        void handlePublishTopTenWinners();
      }
    }
  }, [
    autoPilotEnabled,
    autoPublishAtAnnouncement,
    activePhase,
    loading,
    submissions,
    aiBatchProgress,
    publishingWinners,
    verifySignedAiPreEvaluations,
    syncPodiumStandings,
    handlePublishTopTenWinners,
  ]);

  const toggleAutoPilot = () => {
    const next = !autoPilotEnabled;
    setAutoPilotEnabled(next);
    if (next) {
      autoAttemptedIdsRef.current.clear();
    }
    try {
      window.localStorage.setItem('aotm_autopilot_ai_v1', next ? '1' : '0');
    } catch {
      // Ignore storage error
    }
  };

  const toggleAutoPublish = () => {
    const next = !autoPublishAtAnnouncement;
    setAutoPublishAtAnnouncement(next);
    try {
      window.localStorage.setItem('aotm_autopublish_v1', next ? '1' : '0');
    } catch {
      // Ignore storage error
    }
  };

  const preEvaluatedOfflineCount = useMemo(
    () =>
      submissions.filter(
        (s) =>
          typeof s.aiScore === 'number' &&
          typeof s.aiSignature === 'string' &&
          /^[a-f0-9]{64}$/.test(s.aiSignature)
      ).length,
    [submissions]
  );

  return (
    <div
      id="brankas-admin"
      className="scroll-mt-24 rounded-xl border border-white/15 bg-[#0D1524] p-6 sm:p-8 lg:p-10 text-slate-100"
    >
      {/* Top Admin Vault Header */}
      <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-[#E5C158]">
            <ShieldCheck className="h-4 w-4 text-[#D4AF37]" />
            <span>Brankas Penilaian Owner / Admin</span>
            <span aria-hidden="true" className="text-white/25">·</span>
            <span className="text-slate-400">{ADMIN_EMAIL}</span>
          </div>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Panel Evaluasi AOTM Nusantara Alliance
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
            Urutkan maskapai berdasarkan profit, periksa bukti foto secara
            berdampingan, beri nilai juri, atau buka mode bersih untuk
            screenshot hasil penilaian.
          </p>
        </div>

        {/* Segmented Workspace Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#080E18] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'list'
                ? 'bg-[#D4AF37] text-[#080E18]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Daftar &amp; Penilaian
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'leaderboard'
                ? 'bg-[#D4AF37] text-[#080E18]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            Klasemen Siap SS
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'compare'
                ? 'bg-[#D4AF37] text-[#080E18]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Bandingkan 2 Maskapai
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="mt-6 grid grid-cols-2 divide-y divide-white/10 rounded-xl border border-white/10 bg-[#080E18] lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-400">
            Total Laporan Masuk
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
            {submissions.length}
          </p>
        </div>
        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-400">
            Sudah Dinilai / Juara
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-400 tabular-nums">
            {kpiSummary.verifiedCount}
          </p>
        </div>
        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-400">
            Puncak Total Profit
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-[#E5C158] tabular-nums">
            {kpiSummary.topProfitItem
              ? formatMetric(kpiSummary.topProfitItem.totalProfit)
              : '—'}
          </p>
          {kpiSummary.topProfitItem && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {kpiSummary.topProfitItem.airlineName}
            </p>
          )}
        </div>
        <div className="p-4">
          <p className="text-[11px] font-medium text-slate-400">
            Akumulasi Revenue
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-white tabular-nums">
            {formatMetric(kpiSummary.totalRevenueSum)}
          </p>
        </div>
      </div>

      {/* Autonomous AI Auto-Pilot Bar (Offline Judging + Point-Sorted Ranking) */}
      <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-[#080E18] p-4 lg:flex-row lg:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Bot
              className={`h-4 w-4 ${
                autoPilotRunning
                  ? 'animate-pulse text-[#E5C158]'
                  : autoPilotEnabled
                    ? 'text-emerald-400'
                    : 'text-slate-400'
              }`}
            />
            <span className="font-semibold text-white">
              Mode Auto-Pilot AI (Saat Admin Offline)
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                autoPilotEnabled
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30'
                  : 'bg-slate-800 text-slate-400 border border-white/10'
              }`}
            >
              {autoPilotRunning
                ? 'Sedang Menilai...'
                : autoPilotEnabled
                  ? 'Aktif Otomatis'
                  : 'Nonaktif'}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            {autoPilotRunning && autoPilotInfo
              ? autoPilotInfo
              : submissions.length === 0
                ? 'Setiap laporan yang masuk langsung dinilai AI (bahkan saat admin offline) lalu otomatis diurutkan sesuai poin tertinggi.'
                : unjudgedCount === 0
                  ? `Semua ${submissions.length} maskapai telah dinilai otomatis & diurutkan sesuai poin (${preEvaluatedOfflineCount} dinilai saat admin offline).`
                  : `${unjudgedCount} maskapai menunggu sinkronisasi Auto-Pilot AI.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={toggleAutoPublish}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
              autoPublishAtAnnouncement
                ? 'border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#E5C158]'
                : 'border-white/12 bg-[#0D1524] text-slate-400 hover:text-white'
            }`}
          >
            <Megaphone className="h-3.5 w-3.5" />
            {autoPublishAtAnnouncement
              ? 'Auto-Terbit Jam Pengumuman: ON'
              : 'Auto-Terbit Jam Pengumuman: OFF'}
          </button>

          <button
            type="button"
            onClick={toggleAutoPilot}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              autoPilotEnabled
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-white/15 bg-[#0D1524] text-slate-300 hover:text-white'
            }`}
          >
            {autoPilotEnabled ? 'Auto-Pilot: ON' : 'Aktifkan Auto-Pilot'}
          </button>
        </div>
      </div>

      {/* Automatic Top 1 Candidate Check (Based on 3 Official Criteria) */}
      {topOneRecommendation && (
        <div className="mt-4 flex flex-col justify-between gap-4 rounded-xl border border-[#D4AF37]/40 bg-[#080E18] p-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#E5C158]">
                <Trophy className="h-3.5 w-3.5 text-[#D4AF37]" />
                Cek Otomatis Kandidat Layak Top 1
              </span>
              <span className="text-white/25">·</span>
              <span className="text-[11px] text-slate-400">
                {topOneRecommendation.aiEvaluated
                  ? 'Berdasarkan Skor Juri/AI, Keaslian Foto, Akurasi 5 Angka & Margin'
                  : 'Sementara berdasarkan Profit, 5 Angka & Margin (klik Nilai AI untuk cek foto otomatis)'}
              </span>
            </div>
            <p className="font-display text-base font-bold text-white">
              {topOneRecommendation.candidate.airlineName}{' '}
              <span className="font-sans text-xs font-normal text-slate-400">
                ({topOneRecommendation.candidate.alliance})
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-300">
              <span>
                Profit:{' '}
                <strong className="font-mono text-white">
                  {formatMetric(topOneRecommendation.candidate.totalProfit)}
                </strong>
              </span>
              <span>
                Margin:{' '}
                <strong className="font-mono text-emerald-300">
                  {topOneRecommendation.marginPct.toFixed(1)}%
                </strong>
              </span>
              <span>
                Poin:{' '}
                <strong className="font-mono text-[#E5C158]">
                  {typeof topOneRecommendation.candidate.adminScore === 'number'
                    ? `${topOneRecommendation.candidate.adminScore}/100`
                    : 'Belum dinilai AI'}
                </strong>
              </span>
              <span
                className={
                  topOneRecommendation.isVerifiedClean &&
                  topOneRecommendation.hasValidFiveMetrics &&
                  topOneRecommendation.hasBothPhotos
                    ? 'text-emerald-300 font-medium'
                    : 'text-amber-300 font-medium'
                }
              >
                {topOneRecommendation.isVerifiedClean
                  ? '✓ Lolos 3 Kriteria & Foto Terverifikasi'
                  : 'Perlu verifikasi/nilai AI'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openJudgingCard(topOneRecommendation.candidate)}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#D4AF37]/50 bg-[#131F33] px-3.5 py-2 text-xs font-semibold text-[#E5C158] transition-colors hover:border-[#D4AF37] hover:text-white whitespace-nowrap"
          >
            <Eye className="h-3.5 w-3.5" />
            Periksa Bukti Top 1
          </button>
        </div>
      )}

      {/* Filter & Sort Toolbar */}
      <div className="mt-6 flex flex-col gap-3 border-y border-amber-500/25 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama maskapai, alliance, atau email..."
            className="w-full rounded-lg border border-amber-400/60 bg-[#070F1E] py-2.5 pr-3 pl-9 text-xs text-white placeholder:text-slate-400 shadow-sm focus:border-[#FFE043] focus:ring-1 focus:ring-[#FFE043] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="admin-sort-by"
              className="text-xs font-bold text-amber-200"
            >
              Urutkan:
            </label>
            <select
              id="admin-sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-amber-400/60 bg-[#070F1E] px-3 py-2 text-xs font-semibold text-white shadow-sm focus:border-[#FFE043] focus:ring-1 focus:ring-[#FFE043] focus:outline-none"
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key} className="bg-[#0B1526] text-white">
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="admin-status-filter"
              className="text-xs font-bold text-amber-200"
            >
              Status:
            </label>
            <select
              id="admin-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | JudgeStatus)
              }
              className="rounded-lg border border-amber-400/60 bg-[#070F1E] px-3 py-2 text-xs font-semibold text-white shadow-sm focus:border-[#FFE043] focus:ring-1 focus:ring-[#FFE043] focus:outline-none"
            >
              <option value="ALL" className="bg-[#0B1526] text-white">Semua Status</option>
              {JUDGE_STATUS_OPTIONS.map((st) => (
                <option key={st} value={st} className="bg-[#0B1526] text-white">
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* AI Batch / Sesuaikan Klasemen Button */}
          <button
            type="button"
            disabled={submissions.length === 0 || aiBatchProgress !== null}
            onClick={handleAiBatchEvaluate}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-[#D4AF37]/50 bg-[#080E18] px-4 py-2.5 text-xs font-semibold text-[#E5C158] transition-colors hover:border-[#D4AF37] hover:bg-[#131F33] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {aiBatchProgress ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#E5C158]" />
                <span>Menilai {aiBatchProgress.current}/{aiBatchProgress.total}...</span>
              </>
            ) : unjudgedCount > 0 ? (
              <>
                <Bot className="h-4 w-4 shrink-0 text-[#E5C158]" />
                <span>Nilai Belum Dinilai AI ({unjudgedCount})</span>
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 shrink-0 text-[#E5C158]" />
                <span>Sesuaikan Klasemen (Semua Sudah Dinilai)</span>
              </>
            )}
          </button>

          {/* Publish Winners Button */}
          <button
            type="button"
            disabled={submissions.length === 0 || publishingWinners}
            onClick={handlePublishTopTenWinners}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-xs font-semibold text-[#080E18] transition-colors hover:bg-[#E5C158] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {publishingWinners ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#07101E]" />
                <span>Mempublikasikan Top 10...</span>
              </>
            ) : (
              <>
                <Megaphone className="h-4 w-4 shrink-0" />
                <span>Publikasikan Top 1–10 Resmi</span>
              </>
            )}
          </button>
        </div>
      </div>

      {aiBatchProgress && (
        <div className="mt-4 rounded-md border border-amber-400/80 bg-[#0F1C30] px-4 py-3 text-xs text-amber-100 shadow-md">
          <span className="font-bold text-[#FFD700]">AI sedang memeriksa angka &amp; keaslian foto maskapai{' '}
          <span className="underline">{aiBatchProgress.airlineName}</span>{' '}
          ({aiBatchProgress.current} dari {aiBatchProgress.total})...</span>
        </div>
      )}

      {aiBatchDoneMsg && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-300">
          <Check className="h-4 w-4 shrink-0" />
          <span>{aiBatchDoneMsg}</span>
        </div>
      )}

      {publishDoneMsg && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-[#D4AF37]/45 bg-[#D4AF37]/15 px-4 py-2.5 text-xs font-medium text-[#F3D77A]">
          <Megaphone className="h-4 w-4 shrink-0" />
          <span>{publishDoneMsg}</span>
        </div>
      )}

      {adminError && (
        <p className="mt-4 rounded-md border border-rose-400/35 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
          {adminError}
        </p>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-14 animate-pulse rounded-md border border-white/10 bg-[#101D30]/60"
            />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="mt-6 rounded-md border border-white/10 bg-[#101D30]/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-200">
            Belum ada laporan peserta AOTM Nusantara Alliance
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            Aktifkan &ldquo;Mode Tes Form (Admin)&rdquo; di atas jika Anda ingin
            mencoba mengirim contoh laporan dan foto untuk menguji tampilan
            penilaian.
          </p>
        </div>
      ) : activeTab === 'list' ? (
        /* TAB 1: JUDGING TABLE */
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/15 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="py-3 pr-3">#</th>
                <th className="py-3 pr-4">Maskapai &amp; Alliance</th>
                <th className="py-3 pr-4 text-right">Total Profit</th>
                <th className="py-3 pr-4 text-right">Operating Profit</th>
                <th className="py-3 pr-4 text-right">Codeshare Profit</th>
                <th className="py-3 pr-4 text-right">Revenue</th>
                <th className="py-3 pr-4 text-right">Margin</th>
                <th className="py-3 pr-4">Poin Akhir &amp; Status</th>
                <th className="py-3 pr-4 text-center">Bukti Foto</th>
                <th className="py-3 text-right">Penilaian &amp; SS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sortedAndFiltered.map((item, idx) => {
                const marginPct = calcMarginPct(item);
                const statusLabel = item.judgeStatus || 'Menunggu';
                return (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-white/[0.04]"
                  >
                    <td className="py-3.5 pr-3 align-top font-mono font-semibold text-[#E5C158] tabular-nums">
                      #{idx + 1}
                    </td>
                    <td className="py-3.5 pr-4 align-top">
                      <p className="font-semibold text-slate-50">
                        {item.airlineName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-300">
                        {item.alliance}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {item.submittedByEmail}
                      </p>
                    </td>
                    <td className="py-3.5 pr-4 text-right align-top font-mono font-semibold text-[#E5C158] tabular-nums">
                      {formatMetric(item.totalProfit)}
                    </td>
                    <td className="py-3.5 pr-4 text-right align-top font-mono text-slate-100 tabular-nums">
                      {formatMetric(item.operatingProfit)}
                    </td>
                    <td className="py-3.5 pr-4 text-right align-top font-mono text-slate-200 tabular-nums">
                      {formatMetric(item.codeshareProfit)}
                    </td>
                    <td className="py-3.5 pr-4 text-right align-top font-mono text-emerald-300 tabular-nums">
                      {formatMetric(item.revenue)}
                    </td>
                    <td className="py-3.5 pr-4 text-right align-top font-mono text-slate-300 tabular-nums">
                      {marginPct.toFixed(1)}%
                    </td>
                    <td className="py-3.5 pr-4 align-top">
                      {typeof item.adminScore === 'number' && (
                        <p className="font-mono text-sm font-bold text-slate-50 tabular-nums">
                          {item.adminScore}{' '}
                          <span className="text-[10px] font-normal text-slate-400">
                            poin
                          </span>
                        </p>
                      )}
                      <p
                        className={`mt-0.5 font-semibold ${getStatusTextClass(
                          item.judgeStatus
                        )}`}
                      >
                        {statusLabel}
                      </p>
                      {item.adminNote && (
                        <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-slate-400">
                          {item.adminNote}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 align-top">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({
                              title: `${item.airlineName} — Foto Profit Maskapai`,
                              src: item.profitPhotoDataUrl,
                            })
                          }
                          title="Perbesar Foto Profit Maskapai"
                          className="h-11 w-16 overflow-hidden rounded border border-white/20 bg-black transition-transform hover:scale-105"
                        >
                          <img
                            src={item.profitPhotoDataUrl}
                            alt="Foto profit"
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({
                              title: `${item.airlineName} — Foto Maskapai`,
                              src: item.airlinePhotoDataUrl,
                            })
                          }
                          title="Perbesar Foto Maskapai"
                          className="h-11 w-16 overflow-hidden rounded border border-white/20 bg-black transition-transform hover:scale-105"
                        >
                          <img
                            src={item.airlinePhotoDataUrl}
                            alt="Foto maskapai"
                            className="h-full w-full object-cover"
                          />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 text-right align-top">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openJudgingCard(item)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#D4AF37]/15 px-3 py-1.5 text-[11px] font-semibold text-[#F3D77A] border border-[#D4AF37]/40 hover:bg-[#D4AF37]/25 whitespace-nowrap"
                        >
                          <Award className="h-3.5 w-3.5" />
                          Nilai / Kartu SS
                        </button>
                        {confirmDeleteId === item.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={deletingId === item.id}
                              onClick={() => handleDeleteSubmission(item.id)}
                              className="rounded bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
                            >
                              {deletingId === item.id ? '...' : 'Ya'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded border border-white/20 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            title="Hapus laporan"
                            className="rounded border border-rose-400/30 p-1.5 text-rose-300 hover:bg-rose-500/15"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'leaderboard' ? (
        /* TAB 2: SCREENSHOT-READY LEADERBOARD */
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-300">
              Tampilan klasemen bersih untuk di-screenshot atau diunduh sebagai
              gambar PNG.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setLeaderboardCleanSS((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-[#101D30] px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
              >
                {leaderboardCleanSS ? (
                  <>
                    <Eye className="h-3.5 w-3.5 text-[#E5C158]" />
                    Tampilkan Kontrol Normal
                  </>
                ) : (
                  <>
                    <Camera className="h-3.5 w-3.5 text-[#E5C158]" />
                    Mode Layar Penuh Siap SS
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={exportingPng || rankedForLeaderboard.length === 0}
                onClick={handleDownloadLeaderboardPng}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0B1422] transition-colors hover:bg-[#E5C158] disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                {exportingPng ? 'Menyiapkan PNG...' : 'Unduh PNG Klasemen'}
              </button>
            </div>
          </div>

          <div
            className={
              leaderboardCleanSS
                ? 'fixed inset-0 z-[70] overflow-y-auto bg-[#070F1C] p-6 sm:p-10'
                : ''
            }
          >
            {leaderboardCleanSS && (
              <div className="mx-auto mb-4 flex max-w-5xl justify-end">
                <button
                  type="button"
                  onClick={() => setLeaderboardCleanSS(false)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-[#101D30] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Keluar Mode SS
                </button>
              </div>
            )}

            {/* Branded Screenshot Frame */}
            <div className="mx-auto max-w-5xl rounded-xl border border-[#D4AF37]/40 bg-[#0D1524] p-6 sm:p-8">
              <div className="flex flex-col justify-between gap-4 border-b border-white/15 pb-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[#D4AF37]/60 bg-black">
                    <img
                      src="/assets/alliance-emblem.jpg"
                      alt="Nusantara Alliance"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-[#E5C158] uppercase">
                      Nusantara Alliance · Official Evaluation
                    </p>
                    <h4 className="mt-0.5 font-display text-2xl font-semibold text-slate-50">
                      Klasemen AOTM Nusantara Alliance
                    </h4>
                  </div>
                </div>
                <div className="text-left text-xs text-slate-300 sm:text-right">
                  <p className="font-semibold text-slate-100">
                    {SORT_LABELS[sortBy]}
                  </p>
                  <p className="mt-0.5 font-mono text-slate-400">
                    {rankedForLeaderboard.length} Peserta Aktif
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/15 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                      <th className="py-3 pr-3">Rank</th>
                      <th className="py-3 pr-4">Maskapai</th>
                      <th className="py-3 pr-4">Alliance</th>
                      <th className="py-3 pr-4 text-right">Total Profit</th>
                      <th className="py-3 pr-4 text-right">Operating Profit</th>
                      <th className="py-3 pr-4 text-right">Codeshare Profit</th>
                      <th className="py-3 pr-4 text-right">Revenue</th>
                      <th className="py-3 pr-4 text-right">Poin Akhir</th>
                      <th className="py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rankedForLeaderboard.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={idx < 3 ? 'bg-[#D4AF37]/[0.05]' : ''}
                      >
                        <td className="py-3 pr-3 font-mono text-sm font-bold text-[#E5C158] tabular-nums">
                          #{idx + 1}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-slate-50">
                          {item.airlineName}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {item.alliance}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono font-semibold text-[#E5C158] tabular-nums">
                          {formatMetric(item.totalProfit)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-slate-100 tabular-nums">
                          {formatMetric(item.operatingProfit)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-slate-200 tabular-nums">
                          {formatMetric(item.codeshareProfit)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-emerald-300 tabular-nums">
                          {formatMetric(item.revenue)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono font-bold text-slate-50 tabular-nums">
                          {typeof item.adminScore === 'number'
                            ? item.adminScore
                            : '—'}
                        </td>
                        <td className="py-3 text-right">
                          <span
                            className={`font-semibold ${getStatusTextClass(
                              item.judgeStatus
                            )}`}
                          >
                            {item.judgeStatus || 'Menunggu'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* TAB 3: SIDE-BY-SIDE 2 AIRLINE COMPARISON */
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="compare-left"
                  className="block text-[11px] font-semibold text-slate-400 uppercase"
                >
                  Maskapai Kiri
                </label>
                <select
                  id="compare-left"
                  value={compareLeft?.id || ''}
                  onChange={(e) => setCompareLeftId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/20 bg-[#101D30] px-3 py-2 text-xs text-slate-100 focus:border-[#D4AF37] focus:outline-none"
                >
                  {sortedAndFiltered.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.airlineName} ({formatMetric(item.totalProfit)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="compare-right"
                  className="block text-[11px] font-semibold text-slate-400 uppercase"
                >
                  Maskapai Kanan
                </label>
                <select
                  id="compare-right"
                  value={compareRight?.id || ''}
                  onChange={(e) => setCompareRightId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/20 bg-[#101D30] px-3 py-2 text-xs text-slate-100 focus:border-[#D4AF37] focus:outline-none"
                >
                  {sortedAndFiltered.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.airlineName} ({formatMetric(item.totalProfit)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setCompareCleanSS((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-[#101D30] px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
            >
              <Camera className="h-3.5 w-3.5 text-[#E5C158]" />
              {compareCleanSS ? 'Keluar Mode SS' : 'Mode Layar Penuh Siap SS'}
            </button>
          </div>

          {compareLeft && compareRight && (
            <div
              className={
                compareCleanSS
                  ? 'fixed inset-0 z-[70] overflow-y-auto bg-[#070F1C] p-6 sm:p-10'
                  : ''
              }
            >
              {compareCleanSS && (
                <div className="mx-auto mb-4 flex max-w-6xl justify-end">
                  <button
                    type="button"
                    onClick={() => setCompareCleanSS(false)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-[#101D30] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    Keluar Mode SS
                  </button>
                </div>
              )}

              <div className="mx-auto max-w-6xl rounded-xl border border-[#D4AF37]/40 bg-[#0D1524] p-6">
                <div className="flex items-center gap-3 border-b border-white/15 pb-4">
                  <img
                    src="/assets/alliance-emblem.jpg"
                    alt="Nusantara Alliance"
                    className="h-10 w-10 rounded border border-[#D4AF37]/50 object-cover"
                  />
                  <div>
                    <p className="text-[11px] font-semibold tracking-wider text-[#E5C158] uppercase">
                      Nusantara Alliance · Head-to-Head Evaluation
                    </p>
                    <h4 className="font-display text-lg font-semibold text-slate-50">
                      {compareLeft.airlineName} vs {compareRight.airlineName}
                    </h4>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {[compareLeft, compareRight].map((side, sideIdx) => (
                    <div
                      key={`${side.id}-${sideIdx}`}
                      className="rounded-md border border-white/15 bg-[#0B1524]/80 p-5"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
                        <div>
                          <h5 className="font-display text-lg font-semibold text-slate-50">
                            {side.airlineName}
                          </h5>
                          <p className="text-xs text-[#E5C158]">
                            {side.alliance}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${getStatusTextClass(
                            side.judgeStatus
                          )}`}
                        >
                          {side.judgeStatus || 'Menunggu'}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                        <div>
                          <p className="text-[11px] text-slate-400">
                            Total profit
                          </p>
                          <p className="mt-0.5 font-mono font-semibold text-[#E5C158] tabular-nums">
                            {formatMetric(side.totalProfit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">
                            Operating profit
                          </p>
                          <p className="mt-0.5 font-mono font-semibold text-slate-100 tabular-nums">
                            {formatMetric(side.operatingProfit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">
                            Codeshare profit
                          </p>
                          <p className="mt-0.5 font-mono font-semibold text-slate-100 tabular-nums">
                            {formatMetric(side.codeshareProfit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">Revenue</p>
                          <p className="mt-0.5 font-mono font-semibold text-emerald-300 tabular-nums">
                            {formatMetric(side.revenue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">
                            Operating cost
                          </p>
                          <p className="mt-0.5 font-mono font-semibold text-rose-300 tabular-nums">
                            {formatMetric(side.operatingCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-400">Margin</p>
                          <p className="mt-0.5 font-mono font-semibold text-slate-200 tabular-nums">
                            {calcMarginPct(side).toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({
                              title: `${side.airlineName} — Foto Profit Maskapai`,
                              src: side.profitPhotoDataUrl,
                            })
                          }
                          className="overflow-hidden rounded border border-white/15 bg-black text-left"
                        >
                          <img
                            src={side.profitPhotoDataUrl}
                            alt="Foto profit"
                            className="h-36 w-full object-contain"
                          />
                          <p className="border-t border-white/10 px-2 py-1 text-[10px] text-slate-300">
                            Foto Profit
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({
                              title: `${side.airlineName} — Foto Maskapai`,
                              src: side.airlinePhotoDataUrl,
                            })
                          }
                          className="overflow-hidden rounded border border-white/15 bg-black text-left"
                        >
                          <img
                            src={side.airlinePhotoDataUrl}
                            alt="Foto maskapai"
                            className="h-36 w-full object-contain"
                          />
                          <p className="border-t border-white/10 px-2 py-1 text-[10px] text-slate-300">
                            Foto Maskapai
                          </p>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* INDIVIDUAL JUDGING & SCREENSHOT CARD MODAL */}
      {selectedSubmission && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/82 p-4 backdrop-blur-sm sm:p-6"
        >
          <div className="mx-auto my-4 w-full max-w-4xl space-y-4">
            {/* Control Strip (Hidden in Clean SS Mode except subtle exit button) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {!cardCleanSS ? (
                <p className="text-xs font-medium text-slate-300">
                  Klik &ldquo;Mode Bersih SS&rdquo; untuk menyembunyikan form
                  penilaian sebelum mengambil screenshot.
                </p>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCardCleanSS((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#D4AF37]/50 bg-[#101D30] px-3.5 py-2 text-xs font-semibold text-[#F3D77A] hover:bg-[#162742]"
                >
                  {cardCleanSS ? (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      Tampilkan Panel Penilaian
                    </>
                  ) : (
                    <>
                      <Camera className="h-3.5 w-3.5" />
                      Mode Bersih SS
                    </>
                  )}
                </button>
                {!cardCleanSS && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="rounded-md border border-white/20 bg-[#101D30] p-2 text-slate-300 hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* SCREENSHOT-READY EVALUATION CARD */}
            <div className="rounded-xl border border-[#D4AF37]/45 bg-[#0D1524] p-6 sm:p-8">
              <div className="flex flex-col justify-between gap-4 border-b border-white/15 pb-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[#D4AF37]/60 bg-black">
                    <img
                      src="/assets/alliance-emblem.jpg"
                      alt="Nusantara Alliance"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wider text-[#E5C158] uppercase">
                      <span>Nusantara Alliance</span>
                      <span aria-hidden="true">·</span>
                      <span>AOTM Nusantara Alliance</span>
                    </div>
                    <h4 className="mt-1 font-display text-2xl font-semibold text-slate-50">
                      {selectedSubmission.airlineName}
                    </h4>
                    <p className="text-xs text-slate-300">
                      Alliance: {selectedSubmission.alliance} · Pengirim:{' '}
                      {selectedSubmission.submittedByEmail}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-5 border-t border-white/10 pt-3 sm:border-t-0 sm:pt-0">
                  {selectedRank && (
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] text-slate-400 uppercase">
                        Peringkat
                      </p>
                      <p className="font-mono text-2xl font-bold text-[#E5C158] tabular-nums">
                        #{selectedRank}
                      </p>
                    </div>
                  )}
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-slate-400 uppercase">
                      Status Juri
                    </p>
                    <p
                      className={`text-sm font-semibold ${getStatusTextClass(
                        selectedSubmission.judgeStatus
                      )}`}
                    >
                      {selectedSubmission.judgeStatus || 'Menunggu'}
                    </p>
                    {typeof selectedSubmission.adminScore === 'number' && (
                      <p className="font-mono text-xs text-slate-200 tabular-nums">
                        Skor: {selectedSubmission.adminScore}/100
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* All 5 Metrics + Margin */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <p className="text-[11px] text-slate-400">Total profit</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-[#E5C158] tabular-nums">
                    {formatMetric(selectedSubmission.totalProfit)}
                  </p>
                </div>
                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <p className="text-[11px] text-slate-400">Codeshare profit</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {formatMetric(selectedSubmission.codeshareProfit)}
                  </p>
                </div>
                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <p className="text-[11px] text-slate-400">Operating profit</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {formatMetric(selectedSubmission.operatingProfit)}
                  </p>
                </div>
                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <p className="text-[11px] text-slate-400">Revenue</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-emerald-300 tabular-nums">
                    {formatMetric(selectedSubmission.revenue)}
                  </p>
                </div>
                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <p className="text-[11px] text-slate-400">Operating cost</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-rose-300 tabular-nums">
                    {formatMetric(selectedSubmission.operatingCost)}
                  </p>
                </div>
                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <p className="text-[11px] text-slate-400">Profit margin</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-200 tabular-nums">
                    {calcMarginPct(selectedSubmission).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Side-by-Side Real Photo Proofs */}
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#E5C158]">
                      Foto profit maskapai
                    </p>
                    {!cardCleanSS && (
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxImage({
                            title: `${selectedSubmission.airlineName} — Foto Profit Maskapai`,
                            src: selectedSubmission.profitPhotoDataUrl,
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white"
                      >
                        <Maximize2 className="h-3 w-3" />
                        Perbesar
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxImage({
                        title: `${selectedSubmission.airlineName} — Foto Profit Maskapai`,
                        src: selectedSubmission.profitPhotoDataUrl,
                      })
                    }
                    className="block w-full overflow-hidden rounded bg-black"
                  >
                    <img
                      src={selectedSubmission.profitPhotoDataUrl}
                      alt="Foto profit maskapai"
                      className="h-64 w-full object-contain"
                    />
                  </button>
                </div>

                <div className="rounded border border-white/15 bg-[#0B1524]/90 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#E5C158]">
                      Foto maskapai
                    </p>
                    {!cardCleanSS && (
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxImage({
                            title: `${selectedSubmission.airlineName} — Foto Maskapai`,
                            src: selectedSubmission.airlinePhotoDataUrl,
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11px] text-slate-300 hover:text-white"
                      >
                        <Maximize2 className="h-3 w-3" />
                        Perbesar
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxImage({
                        title: `${selectedSubmission.airlineName} — Foto Maskapai`,
                        src: selectedSubmission.airlinePhotoDataUrl,
                      })
                    }
                    className="block w-full overflow-hidden rounded bg-black"
                  >
                    <img
                      src={selectedSubmission.airlinePhotoDataUrl}
                      alt="Foto maskapai"
                      className="h-64 w-full object-contain"
                    />
                  </button>
                </div>
              </div>

              {selectedSubmission.adminNote && (
                <div className="mt-4 rounded border border-white/15 bg-[#0B1524]/70 px-4 py-3 text-xs text-slate-200">
                  <span className="font-semibold text-[#E5C158]">
                    Catatan Juri:{' '}
                  </span>
                  {selectedSubmission.adminNote}
                </div>
              )}
            </div>

            {/* ADMIN SCORING FORM (Hidden in Clean SS Mode) */}
            {!cardCleanSS && (
              <form
                onSubmit={handleSaveEvaluation}
                className="rounded-lg border border-white/15 bg-[#0F1B2D] p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <h5 className="font-display text-base font-semibold text-slate-50">
                      Penilaian Admin &amp; Asisten AI
                    </h5>
                    <p className="text-[11px] text-slate-400">
                      Gunakan AI untuk membaca angka &amp; memeriksa keaslian
                      kedua foto bukti secara otomatis.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {savedNotice && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Penilaian tersimpan
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={aiEvaluatingSingle}
                      onClick={handleAiEvaluateSingle}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37]/55 bg-[#080E18] px-4 py-2 text-xs font-semibold text-[#E5C158] transition-colors hover:border-[#D4AF37] hover:bg-[#131F33] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aiEvaluatingSingle ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-[#E5C158]" />
                          <span>Menganalisis Foto &amp; Angka...</span>
                        </>
                      ) : (
                        <>
                          <Bot className="h-4 w-4 text-[#E5C158]" />
                          <span>Nilai Otomatis (AI)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {aiSingleFeedback && (
                  <div className="mt-4 rounded-lg border border-[#D4AF37]/50 bg-[#080E18] p-4 text-xs text-white">
                    <span className="font-semibold text-[#E5C158] text-sm mb-2 flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-[#E5C158]" />
                      Hasil Penilaian &amp; Analisis AI:
                    </span>
                    <div className="space-y-1.5 text-slate-100 leading-relaxed">
                      <div>
                        Status Verifikasi Foto:{' '}
                        <span className="font-black text-[#FFE043] uppercase tracking-wide">
                          {aiSingleFeedback.photoMatchStatus}
                        </span>
                      </div>
                      <div>
                        Rekomendasi Skor Juri:{' '}
                        <span className="font-mono font-black text-sm text-[#FFE043]">
                          {aiSingleFeedback.score}/100 Poin
                        </span>
                      </div>
                      <div>
                        Rekomendasi Status:{' '}
                        <span className="font-black text-[#FFE043]">
                          {aiSingleFeedback.recommendedStatus}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] text-amber-200/90 border-t border-amber-400/30 pt-2">
                        💡 Klik tombol <strong className="text-white font-bold underline">Simpan Penilaian</strong> di bawah untuk menerapkan nilai ke klasemen resmi.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="judge-status"
                      className="block text-xs font-semibold text-slate-200"
                    >
                      Status / Peringkat Juara
                    </label>
                    <select
                      id="judge-status"
                      value={editStatus}
                      onChange={(e) =>
                        setEditStatus(e.target.value as JudgeStatus)
                      }
                      className="mt-1.5 w-full rounded-md border border-white/20 bg-[#0B1524] px-3 py-2 text-xs text-slate-100 focus:border-[#D4AF37] focus:outline-none"
                    >
                      {JUDGE_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="judge-score"
                      className="block text-xs font-semibold text-slate-200"
                    >
                      Nilai Juri (0 – 100)
                    </label>
                    <input
                      id="judge-score"
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={editScore}
                      onChange={(e) => setEditScore(e.target.value)}
                      placeholder="Contoh: 95"
                      className="mt-1.5 w-full rounded-md border border-white/20 bg-[#0B1524] px-3 py-2 font-mono text-xs text-slate-100 tabular-nums focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="judge-note"
                      className="block text-xs font-semibold text-slate-200"
                    >
                      Catatan Juri (Opsional)
                    </label>
                    <input
                      id="judge-note"
                      type="text"
                      maxLength={MOON_EVENT_LIMITS.adminNoteMax}
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Contoh: Bukti screenshot valid & sesuai"
                      className="mt-1.5 w-full rounded-md border border-white/20 bg-[#0B1524] px-3 py-2 text-xs text-slate-100 focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setAiSingleFeedback(null);
                    }}
                    className="rounded-md border border-white/20 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/10"
                  >
                    Tutup
                  </button>
                  <button
                    type="submit"
                    disabled={savingEvaluation}
                    className="rounded-md bg-[#D4AF37] px-5 py-2 text-xs font-semibold text-[#0B1422] transition-colors hover:bg-[#E5C158] disabled:opacity-60"
                  >
                    {savingEvaluation ? 'Menyimpan...' : 'Simpan Penilaian'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* High-Resolution Photo Lightbox */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-5xl rounded-lg border border-white/20 bg-[#0B1524] p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-slate-100">
                {lightboxImage.title}
              </p>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="rounded border border-white/20 p-1.5 text-slate-300 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto rounded bg-black">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.title}
                className="mx-auto max-h-[80vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
