import React, { useState } from 'react';

export const HeroSculpture: React.FC = () => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative w-full max-w-[460px] aspect-square mx-auto flex items-center justify-center group select-none">
      {/* Background ambient copper-orange glow */}
      <div className="absolute inset-0 bg-radial from-editorial-copper/25 via-transparent to-transparent blur-3xl rounded-full pointer-events-none transform -translate-y-2" />

      {/* Decorative orbital RF coordinate rings */}
      <div className="absolute inset-2 sm:inset-4 rounded-full border border-editorial-border/60 border-dashed pointer-events-none" />
      <div className="absolute inset-8 sm:inset-10 rounded-full border border-editorial-copper/30 pointer-events-none" />

      {/* High-contrast obsidian dark sculpture aperture */}
      <div className="relative z-10 w-[84%] h-[84%] rounded-full bg-editorial-dark border border-white/10 shadow-2xl flex items-center justify-center p-6 sm:p-8 overflow-hidden group-hover:border-editorial-copper/40 transition-colors duration-500">
        {/* Subtle inner radial gradient for depth */}
        <div className="absolute inset-0 bg-radial from-white/5 via-transparent to-black/60 pointer-events-none" />

        {/* Copper aperture rim highlight */}
        <div className="absolute inset-0 rounded-full border border-editorial-copper/20 pointer-events-none" />

        {/* User-provided Network Lattice asset (White on Dark) */}
        {!imageError ? (
          <img
            src="/assets/airgrid/network_lattice_white.png"
            alt="AirGrid Abstract Network Sculpture"
            onError={() => setImageError(true)}
            className="relative z-10 w-full h-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="relative z-10 text-center font-mono text-xs text-slate-400 p-4">
            Network Lattice Sculpture
          </div>
        )}

        {/* Constellation beacon node indicator */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[9px] font-mono text-editorial-copper tracking-widest uppercase bg-black/60 px-3 py-1 rounded-full border border-white/10 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
          <span>RF Mesh Sculpture</span>
        </div>
      </div>
    </div>
  );
};
