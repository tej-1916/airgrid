import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Radio } from 'lucide-react';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-navy-900 border border-navy-800 flex items-center justify-center shadow-2xl relative">
          <Radio className="w-6 h-6 text-electric-cyan animate-pulse" />
          <div className="absolute inset-0 rounded-2xl border border-electric-cyan/30 animate-ping opacity-25" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs font-mono tracking-widest text-slate-400 uppercase">AirGrid Gateway</p>
          <p className="text-sm font-medium text-slate-200">Verifying Operator Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md p-6 rounded-2xl bg-navy-900 border border-rose-500/30 space-y-4">
          <h2 className="text-lg font-bold text-white">Access Restricted</h2>
          <p className="text-xs text-slate-400">
            Your role (<span className="font-mono text-rose-400">{user.role}</span>) does not have authorization
            to access this console section.
          </p>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : null;
};
