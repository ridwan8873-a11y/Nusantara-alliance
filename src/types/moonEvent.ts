import type { Timestamp } from 'firebase/firestore';

export type JudgeStatus =
  | 'Menunggu'
  | 'Terverifikasi'
  | 'Juara 1'
  | 'Juara 2'
  | 'Juara 3'
  | 'Diskualifikasi';

export const JUDGE_STATUS_OPTIONS: JudgeStatus[] = [
  'Menunggu',
  'Terverifikasi',
  'Juara 1',
  'Juara 2',
  'Juara 3',
  'Diskualifikasi',
];

export interface MoonEventSubmission {
  id: string;
  airlineName: string;
  alliance: string;
  totalProfit: number;
  codeshareProfit: number;
  operatingProfit: number;
  revenue: number;
  operatingCost: number;
  profitPhotoDataUrl: string;
  airlinePhotoDataUrl: string;
  submittedByUid: string;
  submittedByEmail: string;
  judgeStatus?: JudgeStatus;
  adminScore?: number;
  adminNote?: string;
  aiScore?: number;
  aiRecommendedStatus?: JudgeStatus;
  aiPhotoMatchStatus?: 'Sesuai' | 'Perlu Cek Manual' | 'Tidak Sesuai';
  aiTop1Eligible?: boolean;
  aiSummaryNote?: string;
  aiSignature?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export const TOP_RANK_LABELS = [
  'Top 1',
  'Top 2',
  'Top 3',
  'Top 4',
  'Top 5',
  'Top 6',
  'Top 7',
  'Top 8',
  'Top 9',
  'Top 10',
] as const;

export type TopRankLabel = (typeof TOP_RANK_LABELS)[number];

export interface AotmWinner {
  id: string;
  rank: number;
  airlineName: string;
  alliance: string;
  adminScore: number;
  judgeStatus: string;
  photoDataUrl?: string;
  publishedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface OnlinePresenceRecord {
  uid: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarUrl?: string;
  isOnline: boolean;
  lastSeenAt: Timestamp | null;
}

export type AotmEventPhase =
  | 'before_open'
  | 'submission_open'
  | 'judging'
  | 'announcement';

export const MOON_EVENT_LIMITS = {
  airlineNameMin: 2,
  airlineNameMax: 100,
  allianceMin: 2,
  allianceMax: 100,
  maxPhotoDataUrlLength: 350000,
  minPhotoDataUrlLength: 30,
  maxNumericAbs: 1000000000000000,
  adminScoreMin: 0,
  adminScoreMax: 100,
  adminNoteMax: 500,
} as const;

// Event schedule timestamps in WIB (UTC+7)
export const MOON_EVENT_OPEN_ISO = '2026-11-26T00:00:00+07:00';
export const MOON_EVENT_DEADLINE_ISO = '2026-11-27T00:00:00+07:00';
export const MOON_EVENT_ANNOUNCEMENT_ISO = '2026-11-28T19:00:00+07:00';

export const MOON_EVENT_OPEN_DATE_LABEL = '26 November 2026';
export const MOON_EVENT_DEADLINE_LABEL = '27 November 2026, jam 00.00 WIB';
export const MOON_EVENT_ANNOUNCEMENT_LABEL = '28 November 2026, jam 19.00 WIB';

export const AOTM_ANNOUNCEMENT_TITLE =
  'PENGUMUMAN PEMENANG AOTM NOVEMBER 2026 NUSANTARA ALLIANCE';
