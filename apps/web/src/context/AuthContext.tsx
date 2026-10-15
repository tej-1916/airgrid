import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'administrator' | 'network_engineer' | 'viewer' | string;
  is_active: boolean;
  created_at: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  csrfToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/v1/auth/session`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          setCsrfToken(data.csrf_token || null);
        } else {
          setUser(null);
          setCsrfToken(null);
        }
      } else {
        setUser(null);
        setCsrfToken(null);
      }
    } catch {
      setUser(null);
      setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}): Promise<Response> => {
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const headers = new Headers(options.headers || {});

    // For state-changing requests, attach Anti-CSRF token if present
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
      if (!headers.has('X-CSRF-Token')) {
        headers.set('X-CSRF-Token', csrfToken);
      }
    }

    const mergedOptions: RequestInit = {
      ...options,
      credentials: 'include',
      headers,
    };

    const response = await fetch(url, mergedOptions);

    // If session has expired or unauthorized
    if (response.status === 401 && user) {
      setUser(null);
      setCsrfToken(null);
    }

    return response;
  }, [csrfToken, user]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.detail || 'Authentication failed. Please verify your credentials.';
        setError(errMsg);
        return { success: false, error: errMsg };
      }

      setUser(data.user);
      setCsrfToken(data.csrf_token);
      return { success: true };
    } catch {
      const networkErr = 'Unable to connect to AirGrid authentication gateway. Check server connectivity.';
      setError(networkErr);
      return { success: false, error: networkErr };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
    } catch {
      // Ignored during client cleanup
    } finally {
      setUser(null);
      setCsrfToken(null);
      setError(null);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    csrfToken,
    isAuthenticated: !!user,
    login,
    logout,
    refreshSession,
    clearError,
    apiFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
