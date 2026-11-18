import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type { OnlinePresenceRecord } from '../types/moonEvent';

const ONLINE_STALE_MS = 65_000;
const HEARTBEAT_INTERVAL_MS = 20_000;

function getSafePresenceName(user: User, isAdmin: boolean): string {
  if (isAdmin) return 'ADMIN Nusantara';
  const raw = (user.displayName || '').trim();
  if (!raw || raw.includes('@')) {
    const beforeAt = raw.split('@')[0]?.trim();
    return beforeAt && beforeAt.length >= 2
      ? beforeAt.slice(0, 80)
      : 'Anggota Aliansi';
  }
  return raw.slice(0, 80);
}

function getOrCreateTabSessionId(): string {
  const key = 'akasha_presence_tab_id';
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
        : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface OnlinePresenceState {
  onlineUsers: OnlinePresenceRecord[];
  guestCount: number;
  totalOnline: number;
  loading: boolean;
}

export function useOnlinePresence(
  user: User | null,
  isVerifiedUser: boolean,
  isAdmin: boolean
): OnlinePresenceState {
  const [rawRecords, setRawRecords] = useState<OnlinePresenceRecord[]>([]);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const tabSessionIdRef = useRef<string>(getOrCreateTabSessionId());

  // Tick every 10s so stale entries expire smoothly in UI
  useEffect(() => {
    const ticker = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
    return () => window.clearInterval(ticker);
  }, []);

  // 1. Subscribe to Firestore onlinePresence (verified real users)
  useEffect(() => {
    setLoading(true);
    const colPath = 'onlinePresence';
    const q = query(collection(db, colPath), where('isOnline', '==', true));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: OnlinePresenceRecord[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            uid: String(data.uid ?? docSnap.id),
            displayName: String(data.displayName ?? 'Anggota Aliansi'),
            role: data.role === 'admin' ? 'admin' : 'member',
            avatarUrl:
              typeof data.avatarUrl === 'string' &&
              data.avatarUrl.startsWith('https://')
                ? data.avatarUrl
                : undefined,
            isOnline: data.isOnline === true,
            lastSeenAt: data.lastSeenAt ?? null,
          };
        });
        setRawRecords(list);
        setNowMs(Date.now());
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Write real Firestore heartbeat for current verified user
  useEffect(() => {
    if (!isVerifiedUser || !user) return;

    const userUid = user.uid;
    const docPath = `onlinePresence/${userUid}`;

    const publishHeartbeat = async () => {
      const safeName = getSafePresenceName(user, isAdmin);
      const payload: Record<string, unknown> = {
        uid: userUid,
        displayName: safeName,
        role: isAdmin ? 'admin' : 'member',
        isOnline: true,
        lastSeenAt: serverTimestamp(),
      };
      if (
        user.photoURL &&
        user.photoURL.startsWith('https://') &&
        user.photoURL.length >= 8 &&
        user.photoURL.length <= 500
      ) {
        payload.avatarUrl = user.photoURL;
      }

      try {
        await setDoc(doc(db, 'onlinePresence', userUid), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    };

    void publishHeartbeat();

    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void publishHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void publishHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      // Clean up presence record when signing out or unmounting
      void deleteDoc(doc(db, 'onlinePresence', userUid)).catch(() => {
        // Ignore cleanup failure if already signed out
      });
    };
  }, [user, isVerifiedUser, isAdmin]);

  // 3. Ping Express backend for real non-authenticated guest visitors
  useEffect(() => {
    const sessionId = tabSessionIdRef.current;

    const pingServer = async () => {
      try {
        const res = await fetch('/api/presence/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            isAuthenticated: isVerifiedUser,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { guestCount?: number };
          if (typeof data.guestCount === 'number') {
            setGuestCount(Math.max(0, data.guestCount));
          }
        }
      } catch {
        // Non-fatal network blip
      }
    };

    void pingServer();

    const timer = window.setInterval(() => {
      void pingServer();
    }, HEARTBEAT_INTERVAL_MS);

    const handleLeave = () => {
      try {
        const blob = new Blob([JSON.stringify({ sessionId })], {
          type: 'application/json',
        });
        navigator.sendBeacon('/api/presence/leave', blob);
      } catch {
        // Ignore beacon failure
      }
    };
    window.addEventListener('pagehide', handleLeave);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', handleLeave);
    };
  }, [isVerifiedUser]);

  const onlineUsers = useMemo(() => {
    return rawRecords
      .filter((rec) => {
        if (!rec.isOnline) return false;
        // Pending serverTimestamp local write counts as active right now
        if (!rec.lastSeenAt || typeof rec.lastSeenAt.toMillis !== 'function') {
          return true;
        }
        return nowMs - rec.lastSeenAt.toMillis() <= ONLINE_STALE_MS;
      })
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
        return a.displayName.localeCompare(b.displayName, 'id-ID');
      });
  }, [rawRecords, nowMs]);

  const effectiveGuestCount = isVerifiedUser
    ? guestCount
    : Math.max(1, guestCount);

  const totalOnline = onlineUsers.length + effectiveGuestCount;

  return {
    onlineUsers,
    guestCount: effectiveGuestCount,
    totalOnline,
    loading,
  };
}
