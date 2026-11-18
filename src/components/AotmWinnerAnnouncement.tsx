import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { Award, Crown, Loader2, Medal, Trophy, X } from 'lucide-react';
import {
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  AOTM_ANNOUNCEMENT_TITLE,
  MOON_EVENT_ANNOUNCEMENT_LABEL,
  type AotmWinner,
} from '../types/moonEvent';

interface AotmWinnerAnnouncementProps {
  active: boolean;
}

export function AotmWinnerAnnouncement({ active }: AotmWinnerAnnouncementProps) {
  const [winners, setWinners] = useState<AotmWinner[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    title: string;
    src: string;
  } | null>(null);

  useEffect(() => {
    if (!active) {
      setWinners([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const colPath = 'aotmWinners';
    const q = query(collection(db, colPath), orderBy('rank', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: AotmWinner[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            rank: Number(data.rank ?? 0),
            airlineName: String(data.airlineName ?? ''),
            alliance: String(data.alliance ?? ''),
            adminScore: Number(data.adminScore ?? 0),
            judgeStatus: String(data.judgeStatus ?? 'Terverifikasi'),
            photoDataUrl:
              typeof data.photoDataUrl === 'string'
                ? data.photoDataUrl
                : undefined,
            publishedAt: data.publishedAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        setWinners(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, colPath);
      }
    );

    return () => unsubscribe();
  }, [active]);

  if (!active) return null;

  const topThree = winners.filter((w) => w.rank >= 1 && w.rank <= 3);
  const topFourToTen = winners.filter((w) => w.rank >= 4 && w.rank <= 10);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10 text-slate-900 shadow-sm">
      {/* Official Header */}
      <div className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-7 lg:flex-row lg:items-center">
        <div className="flex items-start gap-4 sm:items-center">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-black">
            <img
              src="/assets/alliance-emblem.jpg"
              alt="Nusantara Alliance"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#8C6218]">
              AOTM Nusantara Alliance · Penilaian Resmi Berakhir
            </p>
            <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-950 sm:text-3xl text-balance">
              {AOTM_ANNOUNCEMENT_TITLE}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
              Pengumpulan dan proses penilaian AOTM telah resmi ditutup. Berikut
              hasil resmi Top 1 hingga Top 10 berdasarkan poin akhir juri (
              {MOON_EVENT_ANNOUNCEMENT_LABEL}).
            </p>
          </div>
        </div>
      </div>

      {/* Winners Board */}
      <div className="mt-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#8C6218]" />
            <span>Memuat daftar pemenang resmi Top 1 – Top 10...</span>
          </div>
        ) : winners.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-6 py-10 text-center">
            <Trophy className="mx-auto h-8 w-8 text-[#8C6218]" />
            <h3 className="mt-3 font-display text-lg font-semibold text-slate-950">
              Menunggu Publikasi Papan Pemenang Top 1 – Top 10
            </h3>
            <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-slate-600">
              Penilaian resmi AOTM telah selesai. Pantau papan pemenang di
              halaman ini dan Grup WhatsApp resmi Nusantara Alliance karena Admin
              akan segera mengumumkan pemenang dari Top 1 sampai Top 10.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top 1 - 3 Champions */}
            {topThree.length > 0 && (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {topThree.map((winner) => {
                  const isFirst = winner.rank === 1;
                  const cardTone = isFirst
                    ? 'border-amber-300 bg-amber-50/70 shadow-sm'
                    : 'border-slate-200 bg-slate-50/80 shadow-sm';
                  return (
                    <div
                      key={winner.id}
                      className={`rounded-xl border p-5 text-slate-900 ${cardTone}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold tracking-wider text-[#8C6218] uppercase">
                          {isFirst ? (
                            <Crown className="h-4 w-4 text-[#8C6218]" />
                          ) : (
                            <Medal className="h-4 w-4 text-[#8C6218]" />
                          )}
                          Top {winner.rank} · {winner.judgeStatus}
                        </span>
                        <span className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                          {winner.adminScore}
                          <span className="ml-1 text-[11px] font-normal text-slate-500">
                            poin
                          </span>
                        </span>
                      </div>

                      {winner.photoDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setLightboxImage({
                              title: `Top ${winner.rank} — ${winner.airlineName}`,
                              src: winner.photoDataUrl || '',
                            })
                          }
                          className="mt-3 block w-full overflow-hidden rounded border border-slate-300 bg-slate-100"
                        >
                          <img
                            src={winner.photoDataUrl}
                            alt={winner.airlineName}
                            className="h-40 w-full object-contain"
                          />
                        </button>
                      )}

                      <h3 className="mt-4 font-display text-xl font-bold text-slate-950">
                        {winner.airlineName}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-slate-600">
                        {winner.alliance}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Top 4 - 10 Ranks */}
            {topFourToTen.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
                      <th className="px-4 py-3">Peringkat</th>
                      <th className="px-4 py-3">Maskapai</th>
                      <th className="px-4 py-3">Alliance</th>
                      <th className="px-4 py-3 text-right">Poin Akhir</th>
                      <th className="px-4 py-3 text-right">Foto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topFourToTen.map((winner) => (
                      <tr
                        key={winner.id}
                        className="transition-colors hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-3 font-mono font-bold text-[#8C6218] tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <Award className="h-3.5 w-3.5" />
                            Top {winner.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-950">
                          {winner.airlineName}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-600">
                          {winner.alliance}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-950 tabular-nums">
                          {winner.adminScore} poin
                        </td>
                        <td className="px-4 py-3 text-right">
                          {winner.photoDataUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxImage({
                                  title: `Top ${winner.rank} — ${winner.airlineName}`,
                                  src: winner.photoDataUrl || '',
                                })
                              }
                              className="inline-block h-10 w-16 overflow-hidden rounded border border-slate-200 bg-slate-100 align-middle"
                            >
                              <img
                                src={winner.photoDataUrl}
                                alt={winner.airlineName}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-4xl rounded-lg border border-white/20 bg-[#0B1524] p-4">
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
