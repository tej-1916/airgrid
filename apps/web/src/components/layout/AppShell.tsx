import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CampusProvider } from '../../context/CampusContext';
import { CopilotDrawerProvider } from '../../context/CopilotDrawerContext';
import { CopilotDrawer } from '../copilot/CopilotDrawer';

export const AppShell: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  return (
    <CampusProvider>
      <CopilotDrawerProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-[#F5F5F3] text-[#0B0B0D] antialiased">
          {/* Mobile backdrop */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* Sidebar */}
          <Sidebar
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            mobileOpen={mobileMenuOpen}
            setMobileOpen={setMobileMenuOpen}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Header onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)} />
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F5F5F3]">
              <div className="max-w-7xl mx-auto">
                <Outlet />
              </div>
            </main>
          </div>

          {/* Contextual Copilot Drawer */}
          <CopilotDrawer />
        </div>
      </CopilotDrawerProvider>
    </CampusProvider>
  );
};
