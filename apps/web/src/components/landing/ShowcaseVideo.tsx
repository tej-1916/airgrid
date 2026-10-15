import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';

export const ShowcaseVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  useEffect(() => {
    // Detect system reduced-motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
      if (e.matches && videoRef.current) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    // Attempt autoplay if not reduced motion
    if (!mediaQuery.matches && videoRef.current) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Autoplay was blocked or restricted by browser policy
          setIsPlaying(false);
        });
    }

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const togglePlayback = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  return (
    <div className="relative w-full aspect-square max-w-[420px] mx-auto rounded-3xl bg-black/80 border border-white/10 shadow-2xl overflow-hidden flex items-center justify-center group">
      {/* Ambient corner glow */}
      <div className="absolute inset-0 bg-radial from-editorial-copper/15 via-transparent to-transparent pointer-events-none" />

      {/* Video element or static fallback */}
      {!hasPlaybackError ? (
        <video
          ref={videoRef}
          autoPlay={!prefersReducedMotion}
          loop
          muted
          playsInline
          poster="/assets/airgrid/network_lines_poster.png"
          onError={() => setHasPlaybackError(true)}
          className="w-full h-full object-contain filter contrast-105"
        >
          <source src="/assets/airgrid/network_lines_alpha.webm" type="video/webm" />
          <source src="/assets/airgrid/network_lines_fallback.mp4" type="video/mp4" />
          <source src="/assets/airgrid/network_lines_original.mp4" type="video/mp4" />
          Your browser does not support HTML5 video playback.
        </video>
      ) : (
        <img
          src="/assets/airgrid/network_lines_poster.png"
          alt="Static Network Topology Frame"
          className="w-full h-full object-contain"
        />
      )}

      {/* Top Header Badge */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-white/10 text-[10px] font-mono text-slate-300 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper animate-pulse" />
          <span>Dynamic RF Network Animation</span>
        </div>
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest hidden sm:inline-block">
          Conceptual Simulation
        </span>
      </div>

      {/* Bottom Floating Play/Pause Controls */}
      <div className="absolute bottom-4 right-4 z-20">
        <button
          onClick={togglePlayback}
          className="px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/10 text-[11px] font-mono flex items-center gap-1.5 backdrop-blur-md transition-all shadow-md hover:border-white/25 active:scale-95"
          aria-label={isPlaying ? 'Pause simulation animation' : 'Play simulation animation'}
        >
          {isPlaying ? (
            <>
              <Pause className="w-3 h-3 text-editorial-copper" />
              <span>Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 text-white" />
              <span>Play</span>
            </>
          )}
        </button>
      </div>

      {/* Reduced-motion notice if active */}
      {prefersReducedMotion && (
        <div className="absolute bottom-4 left-4 z-10 text-[10px] font-mono text-slate-400 bg-black/60 px-2 py-0.5 rounded border border-white/5 pointer-events-none">
          Motion reduced (paused)
        </div>
      )}
    </div>
  );
};
