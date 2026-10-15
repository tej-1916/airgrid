import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Campus } from '../types/campus';
import { campusService } from '../services/campusService';
import { useAuth } from './AuthContext';

interface CampusContextType {
  campuses: Campus[];
  selectedCampusId: string | null;
  selectedCampus: Campus | null;
  setSelectedCampusId: (id: string | null) => void;
  refreshCampuses: () => Promise<void>;
  loadingCampuses: boolean;
}

const CampusContext = createContext<CampusContextType | undefined>(undefined);

export const CampusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedCampusId, setSelectedCampusId] = useState<string | null>(null);
  const [loadingCampuses, setLoadingCampuses] = useState<boolean>(false);

  const refreshCampuses = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoadingCampuses(true);
      const res = await campusService.listCampuses({ limit: 100 });
      setCampuses(res.items);
      // If selectedCampusId is set but no longer in list, reset to null
      if (selectedCampusId && !res.items.some((c) => c.id === selectedCampusId)) {
        setSelectedCampusId(null);
      }
    } catch {
      // ignore in background
    } finally {
      setLoadingCampuses(false);
    }
  }, [isAuthenticated, selectedCampusId]);

  useEffect(() => {
    refreshCampuses();
  }, [refreshCampuses]);

  const selectedCampus = campuses.find((c) => c.id === selectedCampusId) || null;

  return (
    <CampusContext.Provider
      value={{
        campuses,
        selectedCampusId,
        selectedCampus,
        setSelectedCampusId,
        refreshCampuses,
        loadingCampuses,
      }}
    >
      {children}
    </CampusContext.Provider>
  );
};

export const useCampus = (): CampusContextType => {
  const context = useContext(CampusContext);
  if (!context) {
    throw new Error('useCampus must be used within a CampusProvider');
  }
  return context;
};
