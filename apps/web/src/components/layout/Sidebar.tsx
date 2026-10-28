import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  Building2,
  MapPin,
  Gauge,
  Router as RouterIcon,
  Activity,
  Cpu,
  BrainCircuit,
  Sliders,
  Bell,
  BarChart3,
  Settings,
  Home,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  phaseBadge?: string;
  isImplemented?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { name: 'Command Center', path: '/dashboard', icon: LayoutDashboard, isImplemented: true },
      { name: 'Campus Manager', path: '/campuses', icon: Building2, isImplemented: true },
      { name: 'Wi-Fi Heatmaps', path: '/heatmaps', icon: MapPin, isImplemented: true },
      { name: 'Network Speed Test', path: '/speed-test', icon: Gauge, isImplemented: true },
      { name: 'Live Network Monitor', path: '/monitor', icon: Activity, phaseBadge: 'P03' },
    ],
  },
  {
    title: 'Infrastructure',
    items: [
      { name: 'Devices & APs', path: '/devices', icon: RouterIcon, phaseBadge: 'P03' },
      { name: 'ML Prediction Lab', path: '/ml-lab', icon: BrainCircuit, isImplemented: true },
      { name: 'Optimization Studio', path: '/optimization', icon: Sliders, isImplemented: true },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { name: 'Network Diagnostics', path: '/diagnostics', icon: Activity, isImplemented: true },
      { name: 'AirGrid Analyst', path: '/ai-analyst', icon: BrainCircuit, isImplemented: true },
      { name: 'AI Model Control', path: '/ai-models', icon: Cpu, phaseBadge: 'P07' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { name: 'Alerts & Inbox', path: '/alerts', icon: Bell, phaseBadge: 'P06' },
      { name: 'Analytics & Reports', path: '/reports', icon: BarChart3, phaseBadge: 'P06' },
    ],
  },
  {
    title: 'System',
    items: [
      { name: 'Settings & Admin', path: '/settings', icon: Settings, isImplemented: true },
      { name: 'Platform Landing', path: '/', icon: Home, isImplemented: true },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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

  return (
    <aside
      className={`
        fixed lg:static top-0 bottom-0 left-0 z-50
        flex flex-col flex-shrink-0 h-screen
        bg-[#FFFFFF] border-r border-[#D9DBDE]
        transition-all duration-200 ease-in-out
        ${collapsed ? 'w-20' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
    >
      {/* Brand & Collapse Header */}
      <div className="h-16 px-4 border-b border-[#D9DBDE] flex items-center justify-between">
        {!collapsed ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#BE6B37] flex items-center justify-center text-white font-bold shadow-sm shadow-[#BE6B37]/30 flex-shrink-0">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-wide text-[#0B0B0D]">AIRGRID</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#ECECE8] text-[#BE6B37] font-semibold border border-[#D9DBDE]">
                  P02
                </span>
              </div>
              <p className="text-[11px] text-[#737373] truncate">Campus Intelligence</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto">
            <div className="w-9 h-9 rounded-xl bg-[#BE6B37] flex items-center justify-center text-white font-bold shadow-sm shadow-[#BE6B37]/30">
              <Radio className="w-5 h-5 text-white" />
            </div>
          </div>
        )}

        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8]"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Desktop collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex p-1.5 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 py-4 px-3 space-y-6 overflow-y-auto overflow-x-hidden">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <h3 className="px-3 text-[11px] font-semibold text-[#737373] uppercase tracking-wider mb-1.5">
                {section.title}
              </h3>
            )}
            <nav className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.name : undefined}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#BE6B37]/10 text-[#0B0B0D] font-semibold'
                          : 'text-[#737373] hover:text-[#0B0B0D] hover:bg-[#ECECE8]/60'
                      } ${collapsed ? 'justify-center px-0' : ''}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Reference A active bar indicator */}
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#BE6B37] rounded-r-full" />
                        )}
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 ${
                            isActive ? 'text-[#BE6B37]' : 'text-[#737373]'
                          }`}
                        />
                        {!collapsed && (
                          <div className="flex-1 flex items-center justify-between min-w-0">
                            <span className="truncate">{item.name}</span>
                            {item.phaseBadge && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#ECECE8] text-[#737373] border border-[#D9DBDE]">
                                {item.phaseBadge}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Authenticated User Footer */}
      <div className="p-3 border-t border-[#D9DBDE] bg-[#F5F5F3]/50">
        {!collapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#BE6B37]/15 text-[#BE6B37] font-semibold flex items-center justify-center text-xs flex-shrink-0 border border-[#BE6B37]/30">
                {getInitials(user?.full_name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#0B0B0D] truncate">
                  {user?.full_name || 'Operator'}
                </p>
                <p className="text-[10px] text-[#737373] capitalize font-mono truncate">
                  {user?.role?.replace('_', ' ') || 'Viewer'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-[#737373] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={handleLogout}
              className="p-2 text-[#737373] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
