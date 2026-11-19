import CampusModelPage from './pages/CampusModelPage';
import React from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';

// 16 Page Views
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CampusesPage } from './pages/CampusesPage';
import { HeatmapsPage } from './pages/HeatmapsPage';
import { SpeedTestPage } from './pages/SpeedTestPage';
import { DevicesPage } from './pages/DevicesPage';
import { MonitorPage } from './pages/MonitorPage';
import { NetworkDiagnosticsPage } from './pages/NetworkDiagnosticsPage';
import { AIAnalystPage } from './pages/AIAnalystPage';
import { AICopilotPage } from './pages/AICopilotPage';
import { AIModelsPage } from './pages/AIModelsPage';
import { MLLabPage } from './pages/MLLabPage';
import { APOptimizationPage } from './pages/APOptimizationPage';
import { AlertsPage } from './pages/AlertsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

// Root layout that provides AuthContext to the entire application tree
const RootLayout: React.FC = () => {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
};

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <LandingPage />,
      },
      {
        path: 'auth/login',
        element: <LoginPage />,
      },
      {
        path: 'login',
        element: <Navigate to="/auth/login" replace />,
      },
      {
        element: (
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        ),
        children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'campuses', element: <CampusesPage /> },
          { path: 'campus-3d', element: <CampusModelPage /> },
          { path: 'heatmaps', element: <HeatmapsPage /> },
          { path: 'speed-test', element: <SpeedTestPage /> },
          { path: 'devices', element: <DevicesPage /> },
          { path: 'monitor', element: <MonitorPage /> },
          { path: 'ai-analyst', element: <AIAnalystPage /> },
          { path: 'ai-copilot', element: <AICopilotPage /> },
          { path: 'copilot', element: <Navigate to="/ai-copilot" replace /> },
          { path: 'network-tools', element: <Navigate to="/diagnostics" replace /> },
          { path: 'diagnostics', element: <NetworkDiagnosticsPage /> },
          { path: 'network-diagnostics', element: <Navigate to="/diagnostics" replace /> },
          { path: 'ai-diagnostics', element: <Navigate to="/diagnostics" replace /> },
          { path: 'ai-models', element: <AIModelsPage /> },
          { path: 'ml-lab', element: <MLLabPage /> },
          { path: 'optimization', element: <APOptimizationPage /> },
          { path: 'ap-optimization', element: <APOptimizationPage /> },
          { path: 'alerts', element: <AlertsPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
