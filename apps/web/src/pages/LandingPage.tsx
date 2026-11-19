import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio,
  ArrowRight,
  ArrowUpRight,
  Activity,
  Cpu,
  MapPin,
  Gauge,
  Bot,
  BarChart3,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { HeroSculpture } from '../components/landing/HeroSculpture';
import { ShowcaseVideo } from '../components/landing/ShowcaseVideo';

export const LandingPage: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeHeroCardIndex, setActiveHeroCardIndex] = useState(0);
  const [activeShowcaseTab, setActiveShowcaseTab] = useState<'noc' | 'heatmaps' | 'speedtest' | 'ai'>('noc');

  const heroCardSnippets = [
    {
      step: '01',
      title: 'Adaptive RF Analysis.',
      desc: 'Coverage heatmaps interpolated from your own recorded survey points, with measured, interpolated and synthetic data labelled.',
      badge: 'Recorded survey points • IDW interpolation',
    },
    {
      step: '02',
      title: 'True Client Vantage.',
      desc: 'Client-browser throughput via Cloudflare Speedtest SDK with zero server conflation.',
      badge: 'Client Benchmark Specification • RFC 3550',
    },
    {
      step: '03',
      title: 'Verified AI Diagnostics.',
      desc: 'Provider-agnostic inference auditing requested versus verified executing models.',
      badge: 'Model Verification Contract • Provider Agnostic',
    },
  ];

  const handleNextHeroCard = () => {
    setActiveHeroCardIndex((prev) => (prev + 1) % heroCardSnippets.length);
  };

  const handlePrevHeroCard = () => {
    setActiveHeroCardIndex((prev) => (prev - 1 + heroCardSnippets.length) % heroCardSnippets.length);
  };

  return (
    <div className="min-h-screen bg-editorial-bg text-editorial-dark font-sans selection:bg-editorial-copper selection:text-white">
      {/* ========================================================================= */}
      {/* SECTION 01: MINIMAL NAVIGATION & IMMERSIVE HERO                           */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-50 bg-editorial-bg/90 backdrop-blur-md border-b border-editorial-border/60 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-full bg-editorial-dark text-editorial-bg flex items-center justify-center shadow-md transition-transform duration-300 group-hover:scale-105">
              <Radio className="w-5 h-5 text-editorial-copper" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-editorial-dark leading-none">
                AIRGRID
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-editorial-muted mt-0.5">
                Campus Intelligence
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-editorial-muted">
            <a href="#about" className="hover:text-editorial-dark transition-colors">
              About
            </a>
            <a href="#platform" className="hover:text-editorial-dark transition-colors">
              Platform
            </a>
            <a href="#features" className="hover:text-editorial-dark transition-colors">
              Features
            </a>
            <a href="#works" className="hover:text-editorial-dark transition-colors">
              How It Works
            </a>
            <a href="#technology" className="hover:text-editorial-dark transition-colors">
              Technology
            </a>
          </nav>

          {/* Right Header Metadata & Login Pill */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="text-right text-[11px] font-mono text-editorial-muted pr-4 border-r border-editorial-border">
              <div className="text-editorial-dark font-medium flex items-center gap-1.5 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
                <span>Operational Airspace</span>
              </div>
              <div>Full-Stack Platform • Production Ready</div>
            </div>

            <Link
              to="/auth/login"
              className="px-5 py-2.5 rounded-full bg-editorial-dark text-editorial-bg hover:bg-black font-semibold text-xs transition-all shadow-sm hover:shadow-md flex items-center gap-2 group"
            >
              <span>Operator Login</span>
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                <ArrowRight className="w-3 h-3 text-white" />
              </div>
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-editorial-dark hover:bg-editorial-softgray/50 transition-colors"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-editorial-border bg-editorial-bg px-6 py-6 space-y-4">
            <nav className="flex flex-col space-y-3 text-sm font-medium text-editorial-muted">
              <a
                href="#about"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-editorial-dark py-1"
              >
                About
              </a>
              <a
                href="#platform"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-editorial-dark py-1"
              >
                Platform
              </a>
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-editorial-dark py-1"
              >
                Features
              </a>
              <a
                href="#works"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-editorial-dark py-1"
              >
                How It Works
              </a>
              <a
                href="#technology"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-editorial-dark py-1"
              >
                Technology
              </a>
            </nav>
            <div className="pt-4 border-t border-editorial-border flex flex-col gap-2">
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3 rounded-full bg-editorial-dark text-white text-center text-xs font-semibold"
              >
                Launch Console
              </Link>
              <Link
                to="/auth/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-3 rounded-full bg-editorial-softgray text-editorial-dark text-center text-xs font-semibold"
              >
                Operator Login
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section Container */}
      <section className="relative overflow-hidden pt-8 pb-16 md:pt-14 md:pb-24 border-b border-editorial-border">
        {/* Giant Faint Ghost Typography (AIRGRID) in Background */}
        <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none select-none overflow-hidden opacity-[0.035]">
          <span className="text-[18vw] font-black tracking-tighter text-editorial-dark whitespace-nowrap leading-none">
            AIRGRID
          </span>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-4 items-center">
            {/* Left Column: Editorial Headline & Actions (5 Columns) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Category Subtitle Pill */}
              <div className="inline-flex items-center gap-2 text-xs font-mono tracking-wide text-editorial-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
                <span className="uppercase">Campus Wireless Intelligence</span>
              </div>

              {/* Oversized Editorial Headline */}
              <h1 className="text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight text-editorial-dark leading-[0.98]">
                Every connection.{' '}
                <span className="block text-editorial-muted font-normal">Understood.</span>
              </h1>

              {/* Supporting Copy */}
              <p className="text-sm md:text-base text-editorial-muted max-w-md leading-relaxed">
                Map wireless coverage. Measure real network performance. Understand connectivity
                through intelligent analysis.
              </p>

              {/* Architectural Specification Badge (Replaces fabricated rating stars) */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-editorial-softgray/70 text-editorial-dark text-xs font-mono border border-editorial-border">
                <Radio className="w-3.5 h-3.5 text-editorial-copper" />
                <span>Campus Airspace Intelligence Specification • 802.11ax / 6GHz</span>
              </div>

              {/* Dual CTA Pills */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="#platform"
                  className="inline-flex items-center gap-3 px-6 py-3.5 rounded-full bg-editorial-dark text-editorial-bg hover:bg-black font-semibold text-xs tracking-wide transition-all shadow-lg hover:shadow-xl group"
                >
                  <span>Explore Platform</span>
                  <div className="w-6 h-6 rounded-full bg-white text-editorial-dark flex items-center justify-center transition-transform group-hover:translate-x-1">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </a>

                <Link
                  to="/dashboard"
                  className="inline-flex items-center px-6 py-3.5 rounded-full bg-editorial-softgray/80 hover:bg-editorial-softgray text-editorial-dark font-semibold text-xs tracking-wide transition-all"
                >
                  <span>Launch Console</span>
                </Link>
              </div>
            </div>

            {/* Center Column: Dominant 3D Wireless Network Sculpture (4 Columns) */}
            <div className="lg:col-span-4 flex items-center justify-center relative my-4 lg:my-0">
              <HeroSculpture />
            </div>

            {/* Right Column: Floating Minimal Information Card (3 Columns) */}
            <div className="lg:col-span-3 flex flex-col items-start lg:items-end justify-center space-y-6">
              <div className="w-full max-w-sm bg-editorial-dark text-white p-6 rounded-2xl shadow-2xl border border-white/10 space-y-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-editorial-copper">
                    <Radio className="w-5 h-5 text-editorial-copper" />
                  </div>
                  <span className="text-xs font-mono text-editorial-copper tracking-wider font-semibold">
                    {heroCardSnippets[activeHeroCardIndex].step}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-white tracking-wide">
                    {heroCardSnippets[activeHeroCardIndex].title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {heroCardSnippets[activeHeroCardIndex].desc}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">
                    {heroCardSnippets[activeHeroCardIndex].badge}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handlePrevHeroCard}
                      className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 transition-colors"
                      aria-label="Previous card"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleNextHeroCard}
                      className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 transition-colors"
                      aria-label="Next card"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Protocol Badges / Target Frameworks (Replaces unverified vendor claims) */}
              <div className="w-full text-left lg:text-right space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-widest text-editorial-muted">
                  Target Ecosystems
                </div>
                <div className="text-xs font-medium text-editorial-dark/80 flex flex-wrap gap-2 lg:justify-end">
                  <span>IEEE 802.11k/v/r</span>
                  <span>•</span>
                  <span>Enterprise AP Telemetry</span>
                  <span>•</span>
                  <span>Linux iw / nmcli</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Edge Metadata Row (Inspired by reference's bottom pill row) */}
          <div className="mt-14 pt-6 border-t border-editorial-border flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-editorial-muted gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-editorial-copper" />
              <span>Multi-Building Campus Topology</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-editorial-dark" />
              <span>Verified AI Inference Provenance</span>
            </div>
            <a
              href="#about"
              className="flex items-center gap-1.5 hover:text-editorial-dark transition-colors group"
            >
              <span>Scroll to Explore</span>
              <span className="group-hover:translate-y-0.5 transition-transform">↓</span>
            </a>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 02: ABOUT AIRGRID                                                 */}
      {/* ========================================================================= */}
      <section id="about" className="py-20 md:py-28 border-b border-editorial-border bg-editorial-bg">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Coordinate Mesh & Badge */}
            <div className="lg:col-span-5 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-editorial-softgray text-editorial-dark text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
                <span>About AirGrid</span>
              </div>

              {/* User-supplied network_globe_white.png mounted on high-contrast obsidian pedestal card */}
              <div className="relative w-full max-w-[320px] aspect-square mx-auto lg:mx-0 rounded-3xl bg-editorial-dark border border-white/10 p-6 shadow-2xl flex flex-col items-center justify-center overflow-hidden group select-none">
                {/* Ambient copper-orange radial glow */}
                <div className="absolute inset-0 bg-radial from-editorial-copper/20 via-transparent to-transparent pointer-events-none" />
                <img
                  src="/assets/airgrid/network_globe_white.png"
                  alt="AirGrid Spatial Coordinate RF Geodesic Matrix"
                  className="w-full h-full object-contain filter drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)] transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none text-[10px] font-mono">
                  <span className="text-slate-300">Spatial RF Matrix</span>
                  <span className="text-editorial-copper uppercase tracking-wider">Geodesic Model</span>
                </div>
              </div>

              <p className="text-xs text-editorial-muted max-w-sm">
                Empirical telemetry ingestion designed for higher education facilities, research laboratories,
                and high-density multi-story complexes.
              </p>
            </div>

            {/* Right Column: Dual-Tone Editorial Statement */}
            <div className="lg:col-span-7 space-y-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-editorial-dark leading-snug">
                We empower university and enterprise network teams to elevate wireless reliability through{' '}
                <span className="text-editorial-copper font-semibold">active client measurements,</span>{' '}
                empirical RF heatmaps, and{' '}
                <span className="text-editorial-muted font-normal">
                  assumption-based layout comparison for planning.
                </span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-editorial-border">
                <div className="space-y-1.5">
                  <div className="text-2xl font-bold font-mono text-editorial-dark">01 / EMPIRICAL</div>
                  <h4 className="text-sm font-semibold text-editorial-dark">True Client Vantage</h4>
                  <p className="text-xs text-editorial-muted leading-relaxed">
                    Browser-executed speed testing measuring actual user download, upload, and latency rather than datacenter backbones.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="text-2xl font-bold font-mono text-editorial-copper">02 / VERIFIED</div>
                  <h4 className="text-sm font-semibold text-editorial-dark">Transparent Intelligence</h4>
                  <p className="text-xs text-editorial-muted leading-relaxed">
                    Strict model identity verification. We track requested versus verified models, detecting stealth API down-ranking.
                  </p>
                </div>
              </div>

              <div>
                <a
                  href="#platform"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-editorial-dark text-editorial-bg text-xs font-semibold hover:bg-black transition-all"
                >
                  <span>Explore Capabilities</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 03: EDITORIAL STATEMENT PILL ROW (SIGNATURE VISUAL ELEMENT)       */}
      {/* ========================================================================= */}
      <section className="py-20 md:py-28 border-b border-editorial-border bg-editorial-bg overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-2 mb-12">
            <span className="text-[11px] font-mono uppercase tracking-widest text-editorial-muted">
              Core Operational Cadence
            </span>
            <h3 className="text-2xl sm:text-3xl font-medium text-editorial-dark">
              Four Pillars of Wireless Intelligence
            </h3>
          </div>

          {/* Rhythmic Horizontal 4-Pill Row inspired directly by reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {/* Pill 01: Measure (Off-White / Light) */}
            <div className="group p-8 rounded-full bg-white border border-editorial-border shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-center justify-center text-center aspect-[2/1] lg:aspect-[7/4] cursor-default hover:-translate-y-1">
              <span className="text-2xl sm:text-3xl md:text-4xl font-semibold text-editorial-dark tracking-tight">
                Measure.
              </span>
              <span className="text-[11px] font-mono text-editorial-muted mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                Client-Side Speedtests
              </span>
            </div>

            {/* Pill 02: Map (Copper Orange) */}
            <div className="group p-8 rounded-full bg-editorial-copper text-white shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center text-center aspect-[2/1] lg:aspect-[7/4] cursor-default hover:-translate-y-1">
              <span className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white tracking-tight">
                Map.
              </span>
              <span className="text-[11px] font-mono text-orange-100 mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                Spatial RF Heatmaps
              </span>
            </div>

            {/* Pill 03: Analyze (Black with Arrow) */}
            <div className="group p-8 rounded-full bg-editorial-dark text-white shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col items-center justify-center text-center aspect-[2/1] lg:aspect-[7/4] cursor-default hover:-translate-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white tracking-tight">
                  Analyze.
                </span>
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center transition-transform group-hover:translate-x-1">
                  <ArrowRight className="w-4 h-4 text-white" />
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                Verified AI Diagnostics
              </span>
            </div>

            {/* Pill 04: Optimize (Soft Gray / Translucent) */}
            <div className="group p-8 rounded-full bg-editorial-softgray border border-editorial-border shadow-sm hover:shadow-md transition-all duration-300 flex flex-col items-center justify-center text-center aspect-[2/1] lg:aspect-[7/4] cursor-default hover:-translate-y-1">
              <span className="text-2xl sm:text-3xl md:text-4xl font-semibold text-editorial-dark tracking-tight">
                Optimize.
              </span>
              <span className="text-[11px] font-mono text-editorial-muted mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
                Algorithmic AP Placement
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 04: PLATFORM FEATURES                                             */}
      {/* ========================================================================= */}
      <section id="features" className="py-20 md:py-28 border-b border-editorial-border bg-editorial-bg">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-editorial-softgray text-editorial-dark text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
                <span>Platform Capabilities</span>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-editorial-dark">
                Engineered for Complete <br />
                Campus Airspace Visibility.
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-editorial-muted max-w-sm leading-relaxed">
              Six modular engines built on a unified FastAPI backend and PostgreSQL schema, engineered
              specifically for campus networks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 01: Wi-Fi Heatmap Studio */}
            <div className="p-8 rounded-3xl bg-white border border-editorial-border shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-editorial-softgray flex items-center justify-center text-editorial-dark">
                <MapPin className="w-6 h-6 text-editorial-copper" />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-editorial-muted">01 / COVERAGE</div>
                <h3 className="text-lg font-semibold text-editorial-dark">Wi-Fi Heatmap Studio</h3>
                <p className="text-xs text-editorial-muted leading-relaxed">
                  2D architectural floor-plan calibration with multi-frequency (2.4 / 5 / 6 GHz) RSSI spatial interpolation and dead-zone boundary detection.
                </p>
              </div>
            </div>

            {/* Feature 02: Network Speed Test Lab */}
            <div className="p-8 rounded-3xl bg-white border border-editorial-border shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-editorial-softgray flex items-center justify-center text-editorial-dark">
                <Gauge className="w-6 h-6 text-editorial-copper" />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-editorial-muted">02 / BENCHMARK</div>
                <h3 className="text-lg font-semibold text-editorial-dark">Network Speed Test Lab</h3>
                <p className="text-xs text-editorial-muted leading-relaxed">
                  Active client-side throughput, RFC 3550 jitter, and packet loss benchmarks via the Cloudflare Speedtest SDK without server conflation.
                </p>
              </div>
            </div>

            {/* Feature 03: AI Diagnostics Studio */}
            <div className="p-8 rounded-3xl bg-white border border-editorial-border shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-editorial-softgray flex items-center justify-center text-editorial-dark">
                <Bot className="w-6 h-6 text-editorial-copper" />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-editorial-muted">03 / INTELLIGENCE</div>
                <h3 className="text-lg font-semibold text-editorial-dark">AI Diagnostics Studio</h3>
                <p className="text-xs text-editorial-muted leading-relaxed">
                  Natural language RF troubleshooting and root cause explanation with strict model verification auditing to detect stealth provider fallbacks.
                </p>
              </div>
            </div>

            {/* Feature 04: ML Prediction Lab */}
            <div className="p-8 rounded-3xl bg-white border border-editorial-border shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-editorial-softgray flex items-center justify-center text-editorial-dark">
                <Cpu className="w-6 h-6 text-editorial-copper" />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-editorial-muted">04 / MACHINE LEARNING</div>
                <h3 className="text-lg font-semibold text-editorial-dark">ML Coverage Prediction</h3>
                <p className="text-xs text-editorial-muted leading-relaxed">
                  Scikit-learn regressors cross-validated on your recorded survey points, plus a simple log-distance path-loss model with a per-wall term (generic, uncalibrated defaults). Predictions are model output, not field-validated measurements.
                </p>
              </div>
            </div>

            {/* Feature 05: AP Optimization Studio */}
            <div className="p-8 rounded-3xl bg-white border border-editorial-border shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-editorial-softgray flex items-center justify-center text-editorial-dark">
                <Sliders className="w-6 h-6 text-editorial-copper" />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-editorial-muted">05 / SIMULATION</div>
                <h3 className="text-lg font-semibold text-editorial-dark">AP Placement Optimization</h3>
                <p className="text-xs text-editorial-muted leading-relaxed">
                  Place virtual access points on a floor and compare the predicted coverage of two layouts, with the assumptions and uncertainty shown. A planning aid: it does not solve placement automatically and is not a measured result.
                </p>
              </div>
            </div>

            {/* Feature 06: Spatial Signal Analytics */}
            <div className="p-8 rounded-3xl bg-white border border-editorial-border shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-editorial-softgray flex items-center justify-center text-editorial-dark">
                <BarChart3 className="w-6 h-6 text-editorial-copper" />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-mono text-editorial-muted">06 / TELEMETRY</div>
                <h3 className="text-lg font-semibold text-editorial-dark">Spatial Signal Analytics</h3>
                <p className="text-xs text-editorial-muted leading-relaxed">
                  Historical multi-session survey comparisons, RSSI statistical distributions, and architectural coverage delta telemetry.
                </p>
              </div>
            </div>
          </div>

          {/* Physical Layer Architecture & Wi-Fi Survey Spotlight featuring user-supplied wifi_router_lineart.png */}
          <div className="mt-12 p-8 md:p-12 rounded-[32px] bg-[#FAF5EE] border border-[#E8E2D5] shadow-sm flex flex-col lg:flex-row items-center gap-10">
            <div className="w-full lg:w-1/2 flex items-center justify-center">
              <div className="p-4 bg-white/70 rounded-2xl border border-[#E0D8C8] shadow-sm">
                <img
                  src="/assets/airgrid/wifi_router_lineart.png"
                  alt="Continuous Line Art of Wi-Fi Router, Coverage Waves, and Campus Infrastructure"
                  className="w-full max-w-[500px] h-auto object-contain rounded-lg"
                />
              </div>
            </div>
            <div className="w-full lg:w-1/2 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E0D8C8] text-editorial-dark text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
                <span>Physical Layer Telemetry</span>
              </div>
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-editorial-dark leading-snug">
                Grounding RF Coverage in Physical Campus Realities.
              </h3>
              <p className="text-xs sm:text-sm text-editorial-muted leading-relaxed">
                Wireless signals do not propagate through empty space—they encounter concrete walls, structural pillars, dynamic client densities, and physical equipment topologies. AirGrid unifies access point locations with empirical client telemetry to optimize real-world connectivity.
              </p>
              <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono text-editorial-dark">
                <span className="px-3 py-1 rounded-full bg-white border border-[#E0D8C8]">AP Geometries</span>
                <span className="px-3 py-1 rounded-full bg-white border border-[#E0D8C8]">Survey Waypoints</span>
                <span className="px-3 py-1 rounded-full bg-white border border-[#E0D8C8]">Structural Attenuation</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 05: PLATFORM SHOWCASE (LARGE BLACK ROUNDED EDITORIAL PANEL)      */}
      {/* ========================================================================= */}
      <section id="platform" className="py-20 md:py-28 border-b border-editorial-border bg-editorial-bg">
        <div className="max-w-7xl mx-auto px-6">
          {/* Signature Big Black Rounded Panel inspired by reference */}
          <div className="rounded-[36px] bg-editorial-dark text-white p-8 md:p-14 border border-white/10 shadow-2xl relative overflow-hidden">
            {/* Ambient Background Gradient Accent */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-editorial-copper/10 blur-3xl rounded-full pointer-events-none" />

            {/* Top Showcase Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-white/10 gap-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold text-editorial-copper">
                  <Activity className="w-5 h-5 text-editorial-copper" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                    Console Preview
                  </span>
                  <h3 className="text-xl font-bold tracking-tight text-white">AirGrid Command Center</h3>
                </div>
              </div>

              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all group"
              >
                <span>Launch Operational Console</span>
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>

            {/* Showcase Interactive Selector & Dynamic View Area + Video */}
            <div className="pt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative z-10">
              {/* Left Column: Interactive Tab Inspector (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <button
                    onClick={() => setActiveShowcaseTab('noc')}
                    className={`px-4 py-2 rounded-full transition-all ${
                      activeShowcaseTab === 'noc'
                        ? 'bg-editorial-copper text-white font-semibold'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    01 / NOC Topology
                  </button>
                  <button
                    onClick={() => setActiveShowcaseTab('heatmaps')}
                    className={`px-4 py-2 rounded-full transition-all ${
                      activeShowcaseTab === 'heatmaps'
                        ? 'bg-editorial-copper text-white font-semibold'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    02 / Heatmap Studio
                  </button>
                  <button
                    onClick={() => setActiveShowcaseTab('speedtest')}
                    className={`px-4 py-2 rounded-full transition-all ${
                      activeShowcaseTab === 'speedtest'
                        ? 'bg-editorial-copper text-white font-semibold'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    03 / Speed Test Lab
                  </button>
                  <button
                    onClick={() => setActiveShowcaseTab('ai')}
                    className={`px-4 py-2 rounded-full transition-all ${
                      activeShowcaseTab === 'ai'
                        ? 'bg-editorial-copper text-white font-semibold'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    04 / AI Diagnostics
                  </button>
                </div>

                {/* Dynamic Showcase View Area */}
                <div className="p-6 md:p-8 rounded-2xl bg-black/60 border border-white/10 font-mono text-xs space-y-4">
                  {activeShowcaseTab === 'noc' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-slate-400 border-b border-white/10 pb-3">
                        <span>MODULE: CAMPUS COMMAND CENTER</span>
                        <span className="text-editorial-copper">● CONCEPTUAL PREVIEW (PHASE 00 ARCHITECTURE)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-slate-400 text-[10px]">CAMPUS HIERARCHY</div>
                          <div className="text-white text-sm font-bold mt-1">Configurable Model</div>
                          <div className="text-slate-500 text-[11px] mt-0.5">Campus → Building → Floor</div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-slate-400 text-[10px]">AP INVENTORY</div>
                          <div className="text-white text-sm font-bold mt-1">Relational Registry</div>
                          <div className="text-slate-500 text-[11px] mt-0.5">AccessPoint ORM Schema</div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/5">
                          <div className="text-slate-400 text-[10px]">GATEWAY STATUS</div>
                          <div className="text-white text-sm font-bold mt-1">Modular Monolith</div>
                          <div className="text-slate-500 text-[11px] mt-0.5">PostgreSQL 16 Engine</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeShowcaseTab === 'heatmaps' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-slate-400 border-b border-white/10 pb-3">
                        <span>MODULE: WI-FI HEATMAP STUDIO</span>
                        <span className="text-editorial-copper">● SPATIAL INTERPOLATION</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs leading-relaxed">
                        Converts discrete survey points (X, Y, RSSI dBm) into continuous RF gradient surfaces
                        calibrated against physical floor plan dimensions (pixels-per-meter scale).
                      </p>
                      <div className="p-3 bg-white/5 rounded-lg text-slate-400 text-[11px]">
                        Threshold Targets: &gt; -65 dBm (Voice/Video Tier) | -75 dBm (Data Tier) | &lt; -80 dBm (Dead Zone Alert)
                      </div>
                    </div>
                  )}

                  {activeShowcaseTab === 'speedtest' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-slate-400 border-b border-white/10 pb-3">
                        <span>MODULE: CLIENT SPEED TEST LAB</span>
                        <span className="text-blue-400">● CLIENT VANTAGE POINT</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs leading-relaxed">
                        Direct browser measurements capturing true client Wi-Fi bottleneck to Cloudflare edge.
                        Safety bounded with 150MB traffic limits and explicit user initiation.
                      </p>
                      <div className="p-3 bg-white/5 rounded-lg text-slate-400 text-[11px]">
                        Pipelines: A (WAN Throughput) | B (WebSocket RTT / Jitter) | C (Packet Loss Sequence) | D (LAN iperf3)
                      </div>
                    </div>
                  )}

                  {activeShowcaseTab === 'ai' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-slate-400 border-b border-white/10 pb-3">
                        <span>MODULE: VERIFIED AI GATEWAY</span>
                        <span className="text-emerald-400">● PROVENANCE AUDIT</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs leading-relaxed">
                        Provider-agnostic inference layer auditing requested model vs. provider-reported model.
                        Detects invisible fallback downgrades and retains execution duration in PostgreSQL.
                      </p>
                      <div className="p-3 bg-white/5 rounded-lg text-slate-400 text-[11px]">
                        Adapter Policy: Requested vs. Verified Model Hash | Zero Hardcoded Keys | Truthful Audit Records
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Feature Pill Badges inside Black Panel */}
                <div className="flex flex-wrap gap-2 pt-2 text-[11px] font-mono text-slate-400">
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white">Modular Monolith</span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white">FastAPI 0.115+</span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white">SQLAlchemy 2.0</span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white">PostgreSQL 16</span>
                  <span className="px-3 py-1 rounded-full bg-white/10 text-white">React 19 / TypeScript</span>
                </div>
              </div>

              {/* Right Column: Embedded Dynamic Network Simulation Video (5 cols) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <ShowcaseVideo />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 06: HOW AIRGRID WORKS                                             */}
      {/* ========================================================================= */}
      <section id="works" className="py-20 md:py-28 border-b border-editorial-border bg-editorial-bg">
        <div className="max-w-7xl mx-auto px-6">
          <div className="space-y-3 mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-editorial-softgray text-editorial-dark text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
              <span>Operational Workflow</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-editorial-dark">
              Four Sequential Stages <br />
              to Network Optimization.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-6 rounded-3xl bg-white border border-editorial-border space-y-4">
              <div className="w-10 h-10 rounded-full bg-editorial-dark text-white flex items-center justify-center font-bold text-xs font-mono">
                01
              </div>
              <h3 className="text-base font-semibold text-editorial-dark">Measure</h3>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Field technicians survey floors logging RSSI, BSSID, and link rates, while users run client-vantage speed tests.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-editorial-border space-y-4">
              <div className="w-10 h-10 rounded-full bg-editorial-copper text-white flex items-center justify-center font-bold text-xs font-mono">
                02
              </div>
              <h3 className="text-base font-semibold text-editorial-dark">Map</h3>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Raw observations are normalized and interpolated onto architectural SVG floor plans with pixel-to-meter scaling.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-editorial-border space-y-4">
              <div className="w-10 h-10 rounded-full bg-editorial-dark text-white flex items-center justify-center font-bold text-xs font-mono">
                03
              </div>
              <h3 className="text-base font-semibold text-editorial-dark">Understand</h3>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Verified AI models diagnose co-channel interference and wall attenuation, identifying dead zones exceeding thresholds.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-editorial-border space-y-4">
              <div className="w-10 h-10 rounded-full bg-editorial-softgray text-editorial-dark flex items-center justify-center font-bold text-xs font-mono">
                04
              </div>
              <h3 className="text-base font-semibold text-editorial-dark">Optimize</h3>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Compare hypothetical AP layouts by model-predicted coverage. Channel plans and automatic power tuning are not modelled; confirm any change with a survey.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 07: TECHNOLOGY & INFRASTRUCTURE                                   */}
      {/* ========================================================================= */}
      <section id="technology" className="py-20 md:py-28 border-b border-editorial-border bg-editorial-bg">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-editorial-softgray text-editorial-dark text-xs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
                <span>Architecture Integrity</span>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-editorial-dark">
                Modern, Reliable, & <br />
                Strictly Non-Fabricated.
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-editorial-muted max-w-sm leading-relaxed">
              Every data point, model metric, and speed measurement is grounded in actual client telemetry and reproducible algorithms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-6 rounded-2xl bg-white border border-editorial-border space-y-2">
              <div className="text-[10px] font-mono text-editorial-muted uppercase">BACKEND</div>
              <div className="text-sm font-semibold text-editorial-dark">FastAPI Modular Monolith</div>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Async Python 3.12+ ASGI engine with strict domain boundaries and non-blocking I/O.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-editorial-border space-y-2">
              <div className="text-[10px] font-mono text-editorial-muted uppercase">DATABASE</div>
              <div className="text-sm font-semibold text-editorial-dark">PostgreSQL 16 + Alembic</div>
              <p className="text-xs text-editorial-muted leading-relaxed">
                20 relational entities, declarative range partitioning for RF time-series, and immutable audit logs.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-editorial-border space-y-2">
              <div className="text-[10px] font-mono text-editorial-muted uppercase">INTELLIGENCE</div>
              <div className="text-sm font-semibold text-editorial-dark">Verified AI Gateway</div>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Provider-agnostic inference tracking requested vs. verified model identity to detect silent fallback.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-editorial-border space-y-2">
              <div className="text-[10px] font-mono text-editorial-muted uppercase">PREDICTIVE MODELING</div>
              <div className="text-sm font-semibold text-editorial-dark">Scikit-Learn ML Regressors</div>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Leakage-safe GroupKFold spatial cross-validation comparing Random Forest and KNN against IDW baselines.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 08: FINAL EDITORIAL CALL TO ACTION                                */}
      {/* ========================================================================= */}
      <section className="py-24 md:py-32 border-b border-editorial-border bg-editorial-bg text-center">
        <div className="max-w-4xl mx-auto px-6 space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-editorial-softgray text-editorial-dark text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper" />
            <span>Campus Network Intelligence Platform</span>
          </div>

          <h2 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-editorial-dark leading-tight">
            Ready to understand your <br />
            <span className="text-editorial-copper">campus wireless airspace?</span>
          </h2>

          <p className="text-sm md:text-base text-editorial-muted max-w-xl mx-auto leading-relaxed">
            Experience empirical coverage mapping, true client speed measurements, and verified AI diagnostics in one unified console.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-editorial-dark text-editorial-bg hover:bg-black font-semibold text-sm tracking-wide transition-all shadow-xl hover:shadow-2xl group"
            >
              <span>Launch Operational Console</span>
              <div className="w-6 h-6 rounded-full bg-white text-editorial-dark flex items-center justify-center transition-transform group-hover:translate-x-1">
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>

            <Link
              to="/auth/login"
              className="inline-flex items-center px-8 py-4 rounded-full bg-editorial-softgray hover:bg-slate-300 text-editorial-dark font-semibold text-sm tracking-wide transition-all"
            >
              <span>Operator Login</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 09: MINIMALIST EDITORIAL FOOTER                                   */}
      {/* ========================================================================= */}
      <footer className="py-16 bg-editorial-bg text-editorial-muted text-xs">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2 font-bold text-sm text-editorial-dark">
                <Radio className="w-4 h-4 text-editorial-copper" />
                <span>AIRGRID</span>
              </div>
              <p className="text-xs text-editorial-muted leading-relaxed">
                AI-Powered Campus Network Intelligence, Monitoring and Optimization Platform.
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-editorial-dark uppercase font-mono text-[11px] tracking-wider">
                Platform
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link to="/dashboard" className="hover:text-editorial-dark transition-colors">
                    Command Center
                  </Link>
                </li>
                <li>
                  <Link to="/campuses" className="hover:text-editorial-dark transition-colors">
                    Campus Topology
                  </Link>
                </li>
                <li>
                  <Link to="/heatmaps" className="hover:text-editorial-dark transition-colors">
                    Wi-Fi Heatmaps
                  </Link>
                </li>
                <li>
                  <Link to="/speed-test" className="hover:text-editorial-dark transition-colors">
                    Speed Test Lab
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-editorial-dark uppercase font-mono text-[11px] tracking-wider">
                Intelligence
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link to="/ai-diagnostics" className="hover:text-editorial-dark transition-colors">
                    AI Diagnostics
                  </Link>
                </li>
                <li>
                  <Link to="/ai-models" className="hover:text-editorial-dark transition-colors">
                    Model Control
                  </Link>
                </li>
                <li>
                  <Link to="/ml-lab" className="hover:text-editorial-dark transition-colors">
                    ML Prediction
                  </Link>
                </li>
                <li>
                  <Link to="/ap-optimization" className="hover:text-editorial-dark transition-colors">
                    AP Placement
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-editorial-dark uppercase font-mono text-[11px] tracking-wider">
                Operations
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link to="/alerts" className="hover:text-editorial-dark transition-colors">
                    Incident Alerts
                  </Link>
                </li>
                <li>
                  <Link to="/reports" className="hover:text-editorial-dark transition-colors">
                    SLA Reports
                  </Link>
                </li>
                <li>
                  <Link to="/settings" className="hover:text-editorial-dark transition-colors">
                    System Settings
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-editorial-border flex flex-col sm:flex-row items-center justify-between gap-4 text-editorial-muted">
            <div className="font-mono text-[11px]">
              © 2026 AirGrid Systems. All rights reserved.
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Full-Stack Platform • Production Ready</span>
              </span>
              <span>TLS 1.3</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
