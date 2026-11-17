import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Building, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCampus } from '../../context/CampusContext';
import { useCopilotDrawer } from '../../context/CopilotDrawerContext';

interface HeaderProps {
  onToggleMobileMenu: () => void;
}

const routeTitleMap: Record<string, string> = {
  '/': 'Platform Overview',
  '/auth/login': 'Login & Authentication',
  '/dashboard': 'Command Center',
  '/campuses': 'Campus & Building Manager',
  '/heatmaps': 'Wi-Fi Heatmap Studio',
  '/speed-test': 'Network Speed Test Lab',
  '/devices': 'Device & Access Point Manager',
  '/monitor': 'Live Network Monitor',
  '/ai-diagnostics': 'Network Diagnostics',
  '/diagnostics': 'Network Diagnostics',
  '/ai-analyst': 'AirGrid Analyst',
  '/ai-copilot': 'AirGrid AI Copilot',
  '/optimization': 'Network Optimization Studio',
  '/ai-models': 'AI Model Control Center',
  '/ml-lab': 'ML Prediction Lab',
  '/ap-optimization': 'AP Optimization Studio',
  '/alerts': 'Alerts & Notifications',
  '/reports': 'Analytics & Reports',
  '/settings': 'Settings & Administration',
};

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { campuses, selectedCampusId, setSelectedCampusId } = useCampus();
  const { toggleDrawer } = useCopilotDrawer();
  const title = routeTitleMap[location.pathname] || 'AirGrid Console';
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // Probe real API Gateway health
    fetch('/healthz')
      .then((res) => (res.ok ? setApiOnline(true) : setApiOnline(false)))
      .catch(() => setApiOnline(false));
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
  };

  const getInitials = (name?: string) => {
    if (!name) return 'OP';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatRoleDisplay = (role?: string) => {
    if (!role) return 'Viewer';
    if (role === 'administrator') return 'Administrator';
    if (role === 'network_engineer') return 'Network Engineer';
    if (role === 'viewer') return 'Viewer';
    return role;
  };

  return (
    <header className="h-16 border-b border-[#D9DBDE] bg-[#FFFFFF] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left side: Hamburger + Title + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8]"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-[#737373] font-medium hidden sm:inline">AirGrid</span>
          <span className="text-[#D9DBDE] hidden sm:inline">/</span>
          <h1 className="text-sm sm:text-base font-bold text-[#0B0B0D] tracking-tight truncate">
            {title}
          </h1>
        </div>
      </div>

      {/* Center / Right side: Campus Selector + Health + User Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Campus Selector Dropdown */}
        <div className="flex items-center gap-1.5 bg-[#F5F5F3] border border-[#D9DBDE] rounded-lg px-2.5 py-1 text-xs text-[#0B0B0D]">
          <Building className="w-3.5 h-3.5 text-[#BE6B37]" />
          <select
            value={selectedCampusId || ''}
            onChange={(e) => setSelectedCampusId(e.target.value ? e.target.value : null)}
            className="bg-transparent text-xs font-medium text-[#0B0B0D] focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[200px] truncate"
          >
            <option value="">All Campuses ({campuses.length})</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        {/* Real API Health Indicator */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium bg-[#FFFFFF] border-[#D9DBDE]">
          {apiOnline === true && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700">API Gateway Online</span>
            </>
          )}
          {apiOnline === false && (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-amber-700">API Offline</span>
            </>
          )}
          {apiOnline === null && (
            <span className="text-[#737373]">Checking...</span>
          )}
        </div>

        {/* Platform Status Badge */}
        <span className="hidden sm:inline-flex text-[11px] font-mono px-2 py-0.5 rounded bg-[#ECECE8] text-[#0B0B0D] font-medium border border-[#D9DBDE]" title="Full-Stack Campus Intelligence & AI Gateway">
          Operational · 17 Routes Active
        </span>

        {/* AI Copilot Quick Drawer Trigger */}
        <button
          onClick={toggleDrawer}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#BE6B37]/15 text-[#BE6B37] hover:bg-[#BE6B37]/25 border border-[#BE6B37]/40 transition-colors shadow-2xs"
          title="Open AirGrid AI Copilot"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#BE6B37]" />
          <span>Copilot</span>
        </button>

        {/* User Badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#D9DBDE]">
          <div className="w-8 h-8 rounded-full bg-[#BE6B37]/15 text-[#BE6B37] border border-[#BE6B37]/30 flex items-center justify-center text-xs font-bold">
            {getInitials(user?.full_name)}
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-semibold text-[#0B0B0D] leading-tight">
              {user?.full_name || 'Operator'}
            </p>
            <p className="text-[10px] text-[#BE6B37] font-semibold font-mono leading-tight">
              {formatRoleDisplay(user?.role)}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 text-[#737373] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
