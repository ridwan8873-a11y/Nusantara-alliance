import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  videoIds: string[];
  itunesQuery: string;
}

const AOTM_PLAYLIST: PlaylistTrack[] = [
  {
    id: 'disenchanted',
    title: 'Disenchanted',
    artist: 'My Chemical Romance',
    videoIds: ['U8csusXxJjA', 'JIReuEmDgn4', 'W0a-x3vqHb0'],
    itunesQuery: 'My Chemical Romance Disenchanted',
  },
  {
    id: 'cancer',
    title: 'Cancer',
    artist: 'My Chemical Romance',
    videoIds: ['yhMP6VLObZE', 'yTuIDYnRUYs', 'EdKu5tdvaa0'],
    itunesQuery: 'My Chemical Romance Cancer',
  },
  {
    id: 'dinda',
    title: 'Dinda',
    artist: 'Masdo',
    videoIds: ['13YRltFWIps'],
    itunesQuery: 'Masdo Dinda',
  },
  {
    id: 'the-one-that-got-away',
    title: 'The One That Got Away',
    artist: 'Katy Perry',
    videoIds: ['Ahha3Cqe_fk'],
    itunesQuery: 'Katy Perry The One That Got Away',
  },
];

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (vol: number) => void;
  unMute: () => void;
  mute: () => void;
  loadVideoById: (videoId: string) => void;
  destroy: () => void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTNamespace {
  Player: new (
    elementId: string | HTMLElement,
    options: {
      height?: string | number;
      width?: string | number;
      host?: string;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YTPlayerEvent) => void;
        onStateChange?: (event: YTPlayerEvent) => void;
        onError?: (event: YTPlayerEvent) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

async function fetchDirectAudioFallback(query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ previewUrl?: string }>;
    };
    const url = data.results?.[0]?.previewUrl;
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
  } catch {
    return null;
  }
}

export function AotmMusicPlayer() {
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100); // Langsung keras (100%)
  const [isMuted, setIsMuted] = useState(false);
  const [localTrack, setLocalTrack] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [fallbackAudioUrl, setFallbackAudioUrl] = useState<string | null>(null);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(true);
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const ytGloballyBlockedRef = useRef(false);
  const trackIndexRef = useRef(trackIndex);
  const fallbackIdxRef = useRef(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const userPausedRef = useRef(false);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);
  const cachedFallbackUrlsRef = useRef<Record<string, string>>({});

  const currentTrack = AOTM_PLAYLIST[trackIndex] ?? AOTM_PLAYLIST[0];

  useEffect(() => {
    trackIndexRef.current = trackIndex;
  }, [trackIndex]);

  useEffect(() => {
    volumeRef.current = volume;
    mutedRef.current = isMuted;
  }, [volume, isMuted]);

  const applyLoudVolume = useCallback((vol: number, muted: boolean) => {
    if (audioElRef.current) {
      audioElRef.current.volume = Math.max(0, Math.min(1, vol / 100));
      audioElRef.current.muted = muted;
    }
    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (muted) {
          ytPlayerRef.current.mute();
        } else {
          ytPlayerRef.current.unMute();
          ytPlayerRef.current.setVolume(vol);
        }
      } catch {
        // Ignore transient YT API readiness errors
      }
    }
  }, []);

  const activateDirectAudioFallback = useCallback(
    async (track: PlaylistTrack, autoPlayAfterLoad: boolean) => {
      ytGloballyBlockedRef.current = true;
      setLoadingFallback(true);
      setAudioUnavailable(false);

      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {
          // Ignore
        }
      }

      let streamUrl: string | null = cachedFallbackUrlsRef.current[track.id] || null;
      if (!streamUrl) {
        streamUrl = await fetchDirectAudioFallback(track.itunesQuery);
        if (streamUrl) {
          cachedFallbackUrlsRef.current[track.id] = streamUrl;
        }
      }

      setLoadingFallback(false);

      if (!streamUrl) {
        setAudioUnavailable(true);
        setIsPlaying(false);
        return;
      }

      setFallbackAudioUrl(streamUrl);
      if (autoPlayAfterLoad && !userPausedRef.current) {
        window.setTimeout(() => {
          if (!audioElRef.current) return;
          audioElRef.current.volume = Math.max(
            0,
            Math.min(1, volumeRef.current / 100)
          );
          audioElRef.current.muted = mutedRef.current;
          audioElRef.current
            .play()
            .then(() => {
              setIsPlaying(true);
              setNeedsGesture(false);
            })
            .catch(() => {
              setNeedsGesture(true);
              setIsPlaying(false);
            });
        }, 50);
      }
    },
    []
  );

  const selectTrack = useCallback(
    (nextIdx: number) => {
      const normalized =
        ((nextIdx % AOTM_PLAYLIST.length) + AOTM_PLAYLIST.length) %
        AOTM_PLAYLIST.length;
      const targetTrack = AOTM_PLAYLIST[normalized];
      trackIndexRef.current = normalized;
      fallbackIdxRef.current = 0;
      userPausedRef.current = false;

      setLocalTrack((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setTrackIndex(normalized);
      setAudioUnavailable(false);
      setNeedsGesture(false);

      if (ytGloballyBlockedRef.current) {
        void activateDirectAudioFallback(targetTrack, true);
        return;
      }

      setFallbackAudioUrl(null);
      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          applyLoudVolume(volumeRef.current, mutedRef.current);
          ytPlayerRef.current.loadVideoById(targetTrack.videoIds[0]);
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        } catch {
          void activateDirectAudioFallback(targetTrack, true);
        }
      }
    },
    [activateDirectAudioFallback, applyLoudVolume]
  );

  const startPlayback = useCallback(() => {
    userPausedRef.current = false;
    setNeedsGesture(false);

    if ((localTrack || fallbackAudioUrl) && audioElRef.current) {
      applyLoudVolume(volumeRef.current, mutedRef.current);
      audioElRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setNeedsGesture(true));
      return;
    }

    if (ytGloballyBlockedRef.current) {
      const active = AOTM_PLAYLIST[trackIndexRef.current] ?? AOTM_PLAYLIST[0];
      void activateDirectAudioFallback(active, true);
      return;
    }

    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        applyLoudVolume(volumeRef.current, mutedRef.current);
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
      } catch {
        setNeedsGesture(true);
      }
    }
  }, [activateDirectAudioFallback, applyLoudVolume, fallbackAudioUrl, localTrack]);

  // Initialize YouTube IFrame API player (with automatic fallback to direct audio stream if blocked)
  useEffect(() => {
    if (localTrack || fallbackAudioUrl) return;

    let destroyed = false;
    let loadTimeoutId = 0;

    const mountPlayer = () => {
      if (destroyed || !playerHostRef.current || !window.YT?.Player) return;
      if (ytPlayerRef.current) return;

      const initialVideoId =
        AOTM_PLAYLIST[trackIndexRef.current]?.videoIds[0] ??
        AOTM_PLAYLIST[0].videoIds[0];

      ytPlayerRef.current = new window.YT.Player(playerHostRef.current, {
        height: '120',
        width: '214',
        host: 'https://www.youtube-nocookie.com',
        videoId: initialVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            if (destroyed) return;
            window.clearTimeout(loadTimeoutId);
            ytReadyRef.current = true;
            try {
              if (!mutedRef.current) {
                event.target.unMute();
                event.target.setVolume(volumeRef.current);
              }
              if (!userPausedRef.current) {
                event.target.playVideo();
              }
            } catch {
              // Autoplay blocked until user gesture
            }
          },
          onStateChange: (event) => {
            if (destroyed) return;
            if (event.data === 1) {
              setIsPlaying(true);
              setNeedsGesture(false);
              setAudioUnavailable(false);
              try {
                if (!mutedRef.current) {
                  event.target.unMute();
                  event.target.setVolume(volumeRef.current);
                }
              } catch {
                // Ignore
              }
            } else if (event.data === 2) {
              setIsPlaying(false);
            } else if (event.data === 0) {
              const nextIdx = (trackIndexRef.current + 1) % AOTM_PLAYLIST.length;
              trackIndexRef.current = nextIdx;
              fallbackIdxRef.current = 0;
              setTrackIndex(nextIdx);
              try {
                event.target.loadVideoById(AOTM_PLAYLIST[nextIdx].videoIds[0]);
                event.target.playVideo();
              } catch {
                void activateDirectAudioFallback(AOTM_PLAYLIST[nextIdx], true);
              }
            }
          },
          onError: () => {
            if (destroyed) return;
            const activeTrack =
              AOTM_PLAYLIST[trackIndexRef.current] ?? AOTM_PLAYLIST[0];
            if (fallbackIdxRef.current < activeTrack.videoIds.length - 1) {
              fallbackIdxRef.current += 1;
              const nextId = activeTrack.videoIds[fallbackIdxRef.current];
              try {
                ytPlayerRef.current?.loadVideoById(nextId);
              } catch {
                void activateDirectAudioFallback(activeTrack, !userPausedRef.current);
              }
            } else {
              // All YouTube embed candidates blocked -> seamlessly fall back to direct studio audio stream
              void activateDirectAudioFallback(activeTrack, !userPausedRef.current);
            }
          },
        },
      });
    };

    // If YouTube script is blocked by network/firewall within 4.5s, fall back cleanly to direct audio stream
    loadTimeoutId = window.setTimeout(() => {
      if (!destroyed && !ytReadyRef.current) {
        const activeTrack =
          AOTM_PLAYLIST[trackIndexRef.current] ?? AOTM_PLAYLIST[0];
        void activateDirectAudioFallback(activeTrack, !userPausedRef.current);
      }
    }, 4500);

    if (window.YT?.Player) {
      mountPlayer();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === 'function') prevReady();
        mountPlayer();
      };

      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.onerror = () => {
          if (!destroyed) {
            const activeTrack =
              AOTM_PLAYLIST[trackIndexRef.current] ?? AOTM_PLAYLIST[0];
            void activateDirectAudioFallback(activeTrack, !userPausedRef.current);
          }
        };
        document.head.appendChild(tag);
      }
    }

    return () => {
      destroyed = true;
      window.clearTimeout(loadTimeoutId);
      ytReadyRef.current = false;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignore cleanup errors
        }
        ytPlayerRef.current = null;
      }
    };
  }, [activateDirectAudioFallback, fallbackAudioUrl, localTrack]);

  // Unlock loud audio on user interaction until playback succeeds or user pauses
  useEffect(() => {
    if (isPlaying) return;

    const handleInteraction = () => {
      if (userPausedRef.current) return;
      startPlayback();
    };

    window.addEventListener('pointerdown', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);

    return () => {
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [isPlaying, startPlayback]);

  useEffect(() => {
    return () => {
      if (localTrack) {
        URL.revokeObjectURL(localTrack.url);
      }
    };
  }, [localTrack]);

  const togglePlayPause = () => {
    if (isPlaying) {
      userPausedRef.current = true;
      if ((localTrack || fallbackAudioUrl) && audioElRef.current) {
        audioElRef.current.pause();
      } else if (ytPlayerRef.current && ytReadyRef.current) {
        ytPlayerRef.current.pauseVideo();
      }
      setIsPlaying(false);
    } else {
      startPlayback();
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    applyLoudVolume(volume, nextMuted);
  };

  const handleVolumeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextVol = Number(e.target.value);
    setVolume(nextVol);
    const nextMuted = nextVol === 0;
    setIsMuted(nextMuted);
    applyLoudVolume(nextVol, nextMuted);
  };

  const handleLocalFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (localTrack) {
      URL.revokeObjectURL(localTrack.url);
    }
    const url = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setFallbackAudioUrl(null);
    setLocalTrack({ url, title: cleanName });
    setAudioUnavailable(false);
    setVolume(100);
    setIsMuted(false);
    userPausedRef.current = false;

    if (ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {
        // Ignore
      }
    }

    window.setTimeout(() => {
      if (audioElRef.current) {
        audioElRef.current.volume = 1.0;
        audioElRef.current.muted = false;
        audioElRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            setNeedsGesture(false);
          })
          .catch(() => setNeedsGesture(true));
      }
    }, 60);
  };

  const activeTitle = localTrack ? localTrack.title : currentTrack.title;
  const activeArtist = localTrack ? 'Musik Lokal' : currentTrack.artist;
  const audioSrc = localTrack ? localTrack.url : fallbackAudioUrl;

  return (
    <>
      {/* Hidden-but-rendered YouTube audio container */}
      {!localTrack && !fallbackAudioUrl && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 -z-50 h-[120px] w-[214px] overflow-hidden opacity-[0.001]"
        >
          <div ref={playerHostRef} />
        </div>
      )}

      {/* Direct Audio element (for local MP3 or unblocked studio audio fallback) */}
      {audioSrc && (
        <audio
          ref={audioElRef}
          src={audioSrc}
          loop={Boolean(localTrack)}
          autoPlay
          playsInline
          onEnded={() => {
            if (!localTrack) {
              selectTrack(trackIndex + 1);
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            setNeedsGesture(false);
          }}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Clean Top Music Bar (Placed above Hero so it never gets blocked by Netlify badges or footer) */}
      <div className="rounded-xl border border-white/25 bg-[#0A1A2F]/80 px-3.5 py-2.5 text-white shadow-md backdrop-blur-md sm:px-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Play/Pause + Track Info */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Jeda Musik' : 'Putar Musik'}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-[#080E18] shadow transition-transform hover:scale-105 hover:bg-[#E5C158] ${
                  !isPlaying && needsGesture ? 'animate-pulse' : ''
                }`}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 translate-x-0.5 fill-current" />
                )}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Music2 className="h-3.5 w-3.5 shrink-0 text-[#E5C158]" />
                  <p className="truncate text-xs font-bold text-white sm:text-sm">
                    {activeTitle}
                  </p>
                </div>
                <p className="truncate text-[11px] text-slate-300">
                  {loadingFallback
                    ? 'Memuat audio langsung...'
                    : audioUnavailable
                      ? 'Audio tidak tersedia — pilih file MP3'
                      : !isPlaying && needsGesture
                        ? `${activeArtist} · Ketuk Play / layar (Vol 100%)`
                        : activeArtist}
                </p>
              </div>
            </div>

            {/* Prev / Next + Local MP3 Upload */}
            <div className="flex shrink-0 items-center gap-1 lg:hidden">
              <button
                type="button"
                onClick={() => selectTrack(trackIndex - 1)}
                aria-label="Lagu sebelumnya"
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-200 hover:bg-white/10 hover:text-white"
              >
                <SkipBack className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => selectTrack(trackIndex + 1)}
                aria-label="Lagu berikutnya"
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-200 hover:bg-white/10 hover:text-white"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>
              <label
                title="Pilih file lagu MP3 dari perangkat"
                className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-200 hover:bg-white/10 hover:text-[#E5C158]"
              >
                <Upload className="h-3.5 w-3.5" />
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleLocalFilePick}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          {/* Right: Track Switcher + Desktop Controls + Volume 100% */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/10 pt-2 lg:border-t-0 lg:pt-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {AOTM_PLAYLIST.map((track, idx) => {
                const active = !localTrack && trackIndex === idx;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => selectTrack(idx)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#F7E7A9]'
                        : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {idx + 1}. {track.title}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1 lg:flex">
                <button
                  type="button"
                  onClick={() => selectTrack(trackIndex - 1)}
                  aria-label="Lagu sebelumnya"
                  title="Lagu sebelumnya"
                  className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => selectTrack(trackIndex + 1)}
                  aria-label="Lagu berikutnya"
                  title="Lagu berikutnya"
                  className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
                <label
                  title="Pilih file lagu MP3 dari perangkat"
                  className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-200 transition-colors hover:bg-white/10 hover:text-[#E5C158]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleLocalFilePick}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Volume Control (Default 100%) */}
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Nyalakan suara' : 'Bisukan suara'}
                  className="text-slate-300 transition-colors hover:text-white"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-[#E5C158]" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume musik"
                  className="h-1.5 w-20 cursor-pointer accent-[#D4AF37] sm:w-24"
                />
                <span className="w-8 text-right font-mono text-[10px] font-semibold text-amber-300 tabular-nums">
                  {isMuted ? 0 : volume}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
