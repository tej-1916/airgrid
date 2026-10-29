import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Lock, Mail, ArrowRight, Radio, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, loading: authLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState('admin@airgrid.local');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determine redirection target (default to Command Center)
  const fromLocation = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(fromLocation, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, fromLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    clearError();

    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      navigate(fromLocation, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-editorial-bg text-editorial-dark flex flex-col justify-between selection:bg-editorial-copper selection:text-white">
      {/* Editorial Top Navigation */}
      <header className="w-full px-6 py-6 sm:px-10 flex items-center justify-between border-b border-editorial-border/60 bg-white/70 backdrop-blur-md sticky top-0 z-30">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-full bg-editorial-dark flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
            <Radio className="w-4 h-4 text-editorial-copper" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wider text-editorial-dark">AIRGRID</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-editorial-dark/5 text-editorial-copper border border-editorial-border">
                SECURE GATEWAY
              </span>
            </div>
            <p className="text-[10px] text-editorial-muted tracking-tight">Campus Wireless Intelligence</p>
          </div>
        </Link>

        <Link
          to="/"
          className="text-xs font-semibold text-editorial-muted hover:text-editorial-dark flex items-center gap-1.5 transition-colors"
        >
          <span>← Back to Overview</span>
        </Link>
      </header>

      {/* Main Login Canvas */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Main Card */}
          <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.04)] border border-editorial-border space-y-7">
            {/* Header Badge & Title */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-editorial-copper/10 text-editorial-copper text-[11px] font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-editorial-copper animate-pulse" />
                <span>OPERATOR ACCESS</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-editorial-dark">
                Sign in to Console
              </h1>
              <p className="text-xs text-editorial-muted leading-relaxed">
                Enter authorized credentials to access multi-building topology, RF spectrum metrics, and AI diagnostics.
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Authentication Notice</p>
                  <p className="text-rose-700 mt-0.5 text-[11px]">{error}</p>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-editorial-dark block">
                  Operator Email
                </label>
                <div className="relative rounded-2xl border border-editorial-border bg-editorial-bg/40 focus-within:border-editorial-copper focus-within:ring-2 focus-within:ring-editorial-copper/15 transition-all">
                  <Mail className="w-4 h-4 text-editorial-muted absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="operator@campus.edu"
                    className="w-full bg-transparent pl-10 pr-4 py-3 text-xs text-editorial-dark placeholder-editorial-muted/60 focus:outline-none font-medium"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-editorial-dark block">
                    Password
                  </label>
                  <span className="text-[10px] font-mono text-editorial-muted">Argon2id Protected</span>
                </div>
                <div className="relative rounded-2xl border border-editorial-border bg-editorial-bg/40 focus-within:border-editorial-copper focus-within:ring-2 focus-within:ring-editorial-copper/15 transition-all">
                  <Lock className="w-4 h-4 text-editorial-muted absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    className="w-full bg-transparent pl-10 pr-11 py-3 text-xs text-editorial-dark placeholder-editorial-muted/60 focus:outline-none font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3.5 text-editorial-muted hover:text-editorial-dark transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || authLoading}
                className="w-full mt-2 py-3.5 px-6 rounded-full bg-editorial-dark hover:bg-black text-white font-semibold text-xs tracking-wide transition-all shadow-md hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 group cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-editorial-copper" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed to Console</span>
                    <ArrowRight className="w-4 h-4 text-editorial-copper group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Security Architecture Footnote */}
            <div className="pt-5 border-t border-editorial-border space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-editorial-dark font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-editorial-copper" />
                <span>Enterprise Security Safeguards</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-editorial-muted">
                <div className="p-2 rounded-xl bg-editorial-bg border border-editorial-border/60">
                  <span className="text-editorial-dark font-bold">Session:</span> HttpOnly Cookie
                </div>
                <div className="p-2 rounded-xl bg-editorial-bg border border-editorial-border/60">
                  <span className="text-editorial-dark font-bold">CSRF:</span> HMAC Double-Token
                </div>
                <div className="p-2 rounded-xl bg-editorial-bg border border-editorial-border/60">
                  <span className="text-editorial-dark font-bold">Hashing:</span> Argon2id v19
                </div>
                <div className="p-2 rounded-xl bg-editorial-bg border border-editorial-border/60">
                  <span className="text-editorial-dark font-bold">RBAC:</span> Server Enforced
                </div>
              </div>
            </div>
          </div>

          {/* Quick Notice */}
          <div className="text-center text-[11px] text-editorial-muted space-y-1">
            <p>AirGrid Campus Network Intelligence Platform</p>
            <p className="text-[10px] font-mono text-editorial-muted/70">Production Access Control • Argon2id &amp; RBAC</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full px-6 py-4 text-center text-xs text-editorial-muted border-t border-editorial-border/60 bg-white/40">
        <span>© {new Date().getFullYear()} AirGrid Systems. All rights reserved.</span>
      </footer>
    </div>
  );
};
