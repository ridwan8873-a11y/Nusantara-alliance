import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
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
}

const MCR_PLAYLIST: PlaylistTrack[] = [
  {
    id: 'disenchanted',
    title: 'Disenchanted',
    artist: 'My Chemical Romance',
    videoIds: ['U8csusXxJjA', 'JIReuEmDgn4', 'W0a-x3vqHb0'],
  },
  {
    id: 'cancer',
    title: 'Cancer',
    artist: 'My Chemical Romance',
    videoIds: ['yhMP6VLObZE', 'yTuIDYnRUYs', 'EdKu5tdvaa0'],
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

export function AotmMusicPlayer() {
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100); // Langsung keras (100%)
  const [isMuted, setIsMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [localTrack, setLocalTrack] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [needsGesture, setNeedsGesture] = useState(true);
  const [ytBlocked, setYtBlocked] = useState(false);

  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const trackIndexRef = useRef(trackIndex);
  const fallbackIdxRef = useRef(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const userPausedRef = useRef(false);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);

  const currentTrack = MCR_PLAYLIST[trackIndex] ?? MCR_PLAYLIST[0];

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

  const selectTrack = useCallback(
    (nextIdx: number) => {
      const normalized =
        ((nextIdx % MCR_PLAYLIST.length) + MCR_PLAYLIST.length) %
        MCR_PLAYLIST.length;
      const targetTrack = MCR_PLAYLIST[normalized];
      trackIndexRef.current = normalized;
      fallbackIdxRef.current = 0;
      userPausedRef.current = false;
      setLocalTrack((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      setTrackIndex(normalized);
      setYtBlocked(false);
      setNeedsGesture(false);

      if (ytPlayerRef.current && ytReadyRef.current) {
        try {
          applyLoudVolume(volumeRef.current, mutedRef.current);
          ytPlayerRef.current.loadVideoById(targetTrack.videoIds[0]);
          ytPlayerRef.current.playVideo();
          setIsPlaying(true);
        } catch {
          // Will play once ready
        }
      }
    },
    [applyLoudVolume]
  );

  const startPlayback = useCallback(() => {
    userPausedRef.current = false;
    setNeedsGesture(false);

    if (localTrack && audioElRef.current) {
      applyLoudVolume(volumeRef.current, mutedRef.current);
      audioElRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setNeedsGesture(true));
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
  }, [applyLoudVolume, localTrack]);

  // Initialize YouTube IFrame API player
  useEffect(() => {
    if (localTrack) return;

    let destroyed = false;

    const mountPlayer = () => {
      if (destroyed || !playerHostRef.current || !window.YT?.Player) return;
      if (ytPlayerRef.current) return;

      const initialVideoId =
        MCR_PLAYLIST[trackIndexRef.current]?.videoIds[0] ??
        MCR_PLAYLIST[0].videoIds[0];

      ytPlayerRef.current = new window.YT.Player(playerHostRef.current, {
        height: '120',
        width: '214',
        videoId: initialVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            if (destroyed) return;
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
            // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
            if (event.data === 1) {
              setIsPlaying(true);
              setNeedsGesture(false);
              setYtBlocked(false);
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
              // Auto-advance seamlessly to the next track in the MCR playlist
              const nextIdx = (trackIndexRef.current + 1) % MCR_PLAYLIST.length;
              trackIndexRef.current = nextIdx;
              fallbackIdxRef.current = 0;
              setTrackIndex(nextIdx);
              try {
                event.target.loadVideoById(MCR_PLAYLIST[nextIdx].videoIds[0]);
                event.target.playVideo();
              } catch {
                setIsPlaying(false);
              }
            }
          },
          onError: () => {
            if (destroyed) return;
            const activeTrack =
              MCR_PLAYLIST[trackIndexRef.current] ?? MCR_PLAYLIST[0];
            if (fallbackIdxRef.current < activeTrack.videoIds.length - 1) {
              fallbackIdxRef.current += 1;
              const nextId = activeTrack.videoIds[fallbackIdxRef.current];
              try {
                ytPlayerRef.current?.loadVideoById(nextId);
              } catch {
                setYtBlocked(true);
              }
            } else {
              setYtBlocked(true);
              setIsPlaying(false);
            }
          },
        },
      });
    };

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
        document.head.appendChild(tag);
      }
    }

    return () => {
      destroyed = true;
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
  }, [localTrack]);

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
      if (localTrack && audioElRef.current) {
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
    setLocalTrack({ url, title: cleanName });
    setYtBlocked(false);
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

  return (
    <>
      {/* Hidden-but-rendered YouTube audio container */}
      {!localTrack && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed bottom-0 right-0 -z-50 h-[120px] w-[214px] overflow-hidden opacity-[0.001]"
        >
          <div ref={playerHostRef} />
        </div>
      )}

      {/* Local Audio element if user selects custom MP3 */}
      {localTrack && (
        <audio
          ref={audioElRef}
          src={localTrack.url}
          loop
          autoPlay
          playsInline
          onPlay={() => {
            setIsPlaying(true);
            setNeedsGesture(false);
          }}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Compact Floating Music Controller */}
      <div className="fixed bottom-4 right-4 z-[110] max-w-[calc(100vw-2rem)]">
        <div className="rounded-xl border border-white/20 bg-[#0A1A2F]/90 text-white shadow-xl backdrop-blur-md">
          {minimized ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Jeda Musik' : 'Putar Musik'}
                className={`flex h-7 w-7 items-center justify-center rounded-full bg-[#D4AF37] text-[#080E18] transition-transform hover:scale-105 ${
                  !isPlaying && needsGesture ? 'animate-pulse' : ''
                }`}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Play className="h-3.5 w-3.5 translate-x-0.5 fill-current" />
                )}
              </button>
              <span className="max-w-[130px] truncate text-xs font-semibold">
                {activeTitle}
              </span>
              <button
                type="button"
                onClick={() => setMinimized(false)}
                aria-label="Perluas pemutar musik"
                className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="w-[288px] p-3 sm:w-[312px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
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
                      <Music2 className="h-3 w-3 shrink-0 text-[#E5C158]" />
                      <p className="truncate text-xs font-bold text-white">
                        {activeTitle}
                      </p>
                    </div>
                    <p className="truncate text-[11px] text-slate-300">
                      {ytBlocked
                        ? 'Embed diblokir — pilih file MP3'
                        : !isPlaying && needsGesture
                          ? 'Ketuk Play / layar · Vol 100%'
                          : activeArtist}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => selectTrack(trackIndex - 1)}
                    aria-label="Lagu sebelumnya"
                    title="Lagu sebelumnya"
                    className="rounded p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <SkipBack className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => selectTrack(trackIndex + 1)}
                    aria-label="Lagu berikutnya"
                    title="Lagu berikutnya"
                    className="rounded p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                  <label
                    title="Pilih file lagu MP3 dari perangkat"
                    className="cursor-pointer rounded p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-[#E5C158]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleLocalFilePick}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setMinimized(true)}
                    aria-label="Perkecil pemutar musik"
                    className="rounded p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* 2-Song Playlist Selector (Disenchanted & Cancer) */}
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                {MCR_PLAYLIST.map((track, idx) => {
                  const active = !localTrack && trackIndex === idx;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => selectTrack(idx)}
                      className={`truncate rounded-md border px-2 py-1 text-left text-[11px] font-medium transition-colors ${
                        active
                          ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#F7E7A9]'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      {idx + 1}. {track.title}
                    </button>
                  );
                })}
              </div>

              {/* Volume Control (Default 100% / Langsung Keras) */}
              <div className="mt-2.5 flex items-center gap-2 border-t border-white/10 pt-2">
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
                  className="h-1.5 w-full cursor-pointer accent-[#D4AF37]"
                />
                <span className="w-8 text-right font-mono text-[10px] font-semibold text-amber-300 tabular-nums">
                  {isMuted ? 0 : volume}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
