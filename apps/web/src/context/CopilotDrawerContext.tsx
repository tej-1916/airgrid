import React, { createContext, useContext, useState } from 'react';

interface CopilotDrawerContextType {
  isOpen: boolean;
  openDrawer: (initialQuery?: string) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  prefillQuery: string;
}

const CopilotDrawerContext = createContext<CopilotDrawerContextType | undefined>(undefined);

export const CopilotDrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prefillQuery, setPrefillQuery] = useState('');

  const openDrawer = (query?: string) => {
    if (query) {
      setPrefillQuery(query);
    }
    setIsOpen(true);
  };

  const closeDrawer = () => {
    setIsOpen(false);
    setPrefillQuery('');
  };

  const toggleDrawer = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <CopilotDrawerContext.Provider
      value={{
        isOpen,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        prefillQuery,
      }}
    >
      {children}
    </CopilotDrawerContext.Provider>
  );
};

export const useCopilotDrawer = () => {
  const context = useContext(CopilotDrawerContext);
  if (!context) {
    throw new Error('useCopilotDrawer must be used within a CopilotDrawerProvider');
  }
  return context;
};
