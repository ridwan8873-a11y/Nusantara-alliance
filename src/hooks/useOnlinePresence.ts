import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type {
  OnlinePresenceRecord,
  SiteVisitorRecord,
} from '../types/moonEvent';

const ONLINE_STALE_MS = 75_000;
const HEARTBEAT_INTERVAL_MS = 20_000;

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Perangkat';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iPhone / iPad';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Perangkat Lain';
}

function detectBrowserLabel(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent || '';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) return 'Safari';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  return 'Browser Lain';
}

function getSafeGoogleDisplayName(user: User, isAdmin: boolean): string {
  if (isAdmin) return 'ADMIN Nusantara';
  const raw = (user.displayName || '').trim();
  if (raw && !raw.includes('@')) {
    return raw.slice(0, 80);
  }
  const emailPrefix = (user.email || '').split('@')[0]?.trim();
  if (emailPrefix && emailPrefix.length >= 2) {
    return emailPrefix.slice(0, 80);
  }
  return 'Pengguna Google';
}

function getOrCreateGuestVisitorId(): string {
  const key = 'akasha_guest_visitor_id_v1';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && /^guest_[a-zA-Z0-9]{8,40}$/.test(existing)) {
      return existing;
    }
    const randomPart =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.replace(
            /[^a-zA-Z0-9]/g,
            ''
          );
    const normalized = (randomPart + 'akasha123456').slice(0, 16);
    const id = `guest_${normalized}`;
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    const fallback = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    return `guest_${fallback || 'visitor01'}`;
  }
}

function getCurrentPathLabel(): string {
  if (typeof window === 'undefined') return '/';
  const raw = `${window.location.pathname || '/'}${window.location.hash || ''}`.trim();
  return (raw || '/').slice(0, 120);
}

function isDocMissingOrRejectedForUpdate(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code) : '';
  return code === 'not-found' || code === 'permission-denied';
}

export interface OnlinePresenceState {
  onlineUsers: OnlinePresenceRecord[];
  onlineVisitors: SiteVisitorRecord[];
  allVisitors: SiteVisitorRecord[];
  guestCount: number;
  onlineGoogleCount: number;
  totalOnline: number;
  totalRecordedVisitors: number;
  loading: boolean;
  deleteVisitor: (visitorId: string) => Promise<void>;
}

export function useOnlinePresence(
  user: User | null,
  authReady: boolean,
  isVerifiedUser: boolean,
  isAdmin: boolean
): OnlinePresenceState {
  const [rawVisitors, setRawVisitors] = useState<SiteVisitorRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const guestVisitorIdRef = useRef<string>(getOrCreateGuestVisitorId());
  const guestWrittenInTabRef = useRef<boolean>(false);

  // Tick every 10s so stale online statuses transition smoothly in UI
  useEffect(() => {
    const ticker = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
    return () => window.clearInterval(ticker);
  }, []);

  // 1. Admin-only real-time subscription to ALL website visitors & active online status
  useEffect(() => {
    if (!authReady || !isAdmin) {
      setRawVisitors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const colPath = 'siteVisitors';
    const q = query(
      collection(db, colPath),
      orderBy('lastSeenAt', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: SiteVisitorRecord[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const vType =
            data.visitorType === 'admin' || data.visitorType === 'google'
              ? data.visitorType
              : 'guest';
          return {
            visitorId: String(data.visitorId ?? docSnap.id),
            visitorType: vType,
            displayName: String(data.displayName ?? 'Pengunjung Tamu'),
            uid: typeof data.uid === 'string' ? data.uid : undefined,
            email: typeof data.email === 'string' ? data.email : undefined,
            avatarUrl:
              typeof data.avatarUrl === 'string' &&
              data.avatarUrl.startsWith('https://')
                ? data.avatarUrl
                : undefined,
            airlineName:
              typeof data.airlineName === 'string'
                ? data.airlineName
                : undefined,
            deviceLabel: String(data.deviceLabel ?? 'Perangkat'),
            browserLabel: String(data.browserLabel ?? 'Browser'),
            lastPath:
              typeof data.lastPath === 'string' ? data.lastPath : undefined,
            isOnline: data.isOnline === true,
            visitCount:
              typeof data.visitCount === 'number' && data.visitCount >= 1
                ? data.visitCount
                : 1,
            firstEnteredAt: data.firstEnteredAt ?? null,
            lastSeenAt: data.lastSeenAt ?? null,
          };
        });
        setRawVisitors(list);
        setNowMs(Date.now());
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    );

    return () => unsubscribe();
  }, [authReady, isAdmin]);

  // 2. Write real Firestore visitor presence for EVERY visitor (Google users & Guests)
  // Works on both local Express dev server and static Netlify production!
  useEffect(() => {
    if (!authReady) return;

    const deviceLabel = detectDeviceLabel();
    const browserLabel = detectBrowserLabel();
    const verifiedGoogle = Boolean(isVerifiedUser && user && user.email);
    const activeVisitorId = verifiedGoogle
      ? `user_${user!.uid}`
      : guestVisitorIdRef.current;

    const docRef = doc(db, 'siteVisitors', activeVisitorId);
    const docPath = `siteVisitors/${activeVisitorId}`;
    const createdFlagKey = `akasha_visitor_created_${activeVisitorId}`;
    const sessionCountedKey = `akasha_visitor_counted_${activeVisitorId}`;

    let cancelled = false;

    const markPreviousGuestOfflineIfLoggedIn = async () => {
      if (!verifiedGoogle || !guestWrittenInTabRef.current) return;
      guestWrittenInTabRef.current = false;
      const guestRef = doc(db, 'siteVisitors', guestVisitorIdRef.current);
      try {
        await updateDoc(guestRef, {
          isOnline: false,
          lastSeenAt: serverTimestamp(),
        });
      } catch {
        // Ignore if guest doc does not exist
      }
    };

    const buildBaseFields = () => {
      const base: Record<string, unknown> = {
        visitorId: activeVisitorId,
        visitorType: verifiedGoogle ? (isAdmin ? 'admin' : 'google') : 'guest',
        displayName: verifiedGoogle
          ? getSafeGoogleDisplayName(user!, isAdmin)
          : `Tamu #${guestVisitorIdRef.current.slice(-4).toUpperCase()}`,
        deviceLabel,
        browserLabel,
        lastPath: getCurrentPathLabel(),
        isOnline: true,
        lastSeenAt: serverTimestamp(),
      };

      if (verifiedGoogle && user) {
        base.uid = user.uid;
        if (user.email && user.email.length >= 5 && user.email.length <= 160) {
          base.email = user.email;
        }
        if (
          user.photoURL &&
          user.photoURL.startsWith('https://') &&
          user.photoURL.length >= 8 &&
          user.photoURL.length <= 500
        ) {
          base.avatarUrl = user.photoURL;
        }
      }

      return base;
    };

    const publishPresence = async (allowVisitIncrement: boolean) => {
      if (cancelled) return;

      let alreadyCountedInTab = false;
      try {
        alreadyCountedInTab =
          window.sessionStorage.getItem(sessionCountedKey) === '1';
      } catch {
        alreadyCountedInTab = false;
      }

      const shouldIncrement = allowVisitIncrement && !alreadyCountedInTab;

      let localDocExists = false;
      try {
        localDocExists = window.localStorage.getItem(createdFlagKey) === '1';
      } catch {
        localDocExists = false;
      }

      const baseFields = buildBaseFields();

      const createVisitorDoc = async () => {
        const createPayload: Record<string, unknown> = {
          ...baseFields,
          visitCount: 1,
          firstEnteredAt: serverTimestamp(),
        };
        await setDoc(docRef, createPayload);
        try {
          window.localStorage.setItem(createdFlagKey, '1');
          window.sessionStorage.setItem(sessionCountedKey, '1');
        } catch {
          // Ignore storage errors
        }
      };

      const updateVisitorDoc = async () => {
        const { visitorId: _omitId, ...updatableFields } = baseFields;
        const updatePayload: Record<string, unknown> = {
          ...updatableFields,
        };
        if (shouldIncrement) {
          updatePayload.visitCount = increment(1);
        }
        await updateDoc(docRef, updatePayload);
        try {
          window.localStorage.setItem(createdFlagKey, '1');
          if (shouldIncrement) {
            window.sessionStorage.setItem(sessionCountedKey, '1');
          }
        } catch {
          // Ignore storage errors
        }
      };

      try {
        // For Google users (who may sign in across devices) or returning guests, try update first;
        // for fresh guests with no local flag yet, create directly to avoid extra round-trip.
        if (verifiedGoogle || localDocExists) {
          try {
            await updateVisitorDoc();
          } catch (err) {
            if (isDocMissingOrRejectedForUpdate(err)) {
              await createVisitorDoc();
            } else {
              throw err;
            }
          }
        } else {
          try {
            await createVisitorDoc();
          } catch {
            await updateVisitorDoc();
          }
        }

        if (!verifiedGoogle) {
          guestWrittenInTabRef.current = true;
        }
      } catch (err) {
        console.warn(`Visitor presence write warning (${docPath}):`, err);
      }
    };

    void markPreviousGuestOfflineIfLoggedIn().then(() => publishPresence(true));

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void publishPresence(false);
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void publishPresence(false);
      }
    };

    const handlePageHide = () => {
      void updateDoc(docRef, {
        isOnline: false,
        lastSeenAt: serverTimestamp(),
      }).catch(() => {
        // Stale timeout (75s) handles offline transition if tab closes before request finishes
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      // Mark offline WITHOUT deleting so Admin can still see who already entered the website
      void updateDoc(docRef, {
        isOnline: false,
        lastSeenAt: serverTimestamp(),
      }).catch(() => {
        // Ignore cleanup errors
      });
    };
  }, [authReady, user, isVerifiedUser, isAdmin]);

  const deleteVisitor = useCallback(async (visitorId: string) => {
    const docPath = `siteVisitors/${visitorId}`;
    try {
      await deleteDoc(doc(db, 'siteVisitors', visitorId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }, []);

  const onlineVisitors = useMemo(() => {
    return rawVisitors
      .filter((rec) => {
        if (!rec.isOnline) return false;
        if (!rec.lastSeenAt || typeof rec.lastSeenAt.toMillis !== 'function') {
          return true;
        }
        return nowMs - rec.lastSeenAt.toMillis() <= ONLINE_STALE_MS;
      })
      .sort((a, b) => {
        const rankOrder = { admin: 0, google: 1, guest: 2 };
        if (rankOrder[a.visitorType] !== rankOrder[b.visitorType]) {
          return rankOrder[a.visitorType] - rankOrder[b.visitorType];
        }
        const aMs = a.lastSeenAt?.toMillis?.() ?? nowMs;
        const bMs = b.lastSeenAt?.toMillis?.() ?? nowMs;
        return bMs - aMs;
      });
  }, [rawVisitors, nowMs]);

  const onlineUsers: OnlinePresenceRecord[] = useMemo(() => {
    return onlineVisitors
      .filter((rec) => rec.visitorType !== 'guest')
      .map((rec) => ({
        uid: rec.uid || rec.visitorId,
        displayName: rec.displayName,
        role: rec.visitorType === 'admin' ? 'admin' : 'member',
        avatarUrl: rec.avatarUrl,
        isOnline: rec.isOnline,
        lastSeenAt: rec.lastSeenAt,
      }));
  }, [onlineVisitors]);

  const onlineGoogleCount = onlineUsers.length;
  const guestCount = onlineVisitors.filter(
    (rec) => rec.visitorType === 'guest'
  ).length;
  const totalOnline = onlineVisitors.length;

  return {
    onlineUsers,
    onlineVisitors,
    allVisitors: rawVisitors,
    guestCount,
    onlineGoogleCount,
    totalOnline,
    totalRecordedVisitors: rawVisitors.length,
    loading,
    deleteVisitor,
  };
}
