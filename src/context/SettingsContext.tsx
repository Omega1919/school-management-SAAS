import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SchoolSettings } from '../types.ts';
import { apiRequest } from '../lib/api.ts';

interface SettingsContextType {
  settings: SchoolSettings;
  schoolName: string;
  currencySymbol: string;
  motto: string;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (newSettings: Partial<SchoolSettings>) => Promise<SchoolSettings>;
}

const defaultSettings: SchoolSettings = {
  id: 1,
  schoolName: 'School Management System',
  motto: 'Integrated Academic & Administrative Platform',
  currencySymbol: '$',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SchoolSettings>(defaultSettings);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await apiRequest<SchoolSettings>('/settings');
      if (data && data.schoolName) {
        setSettings(data);
      }
    } catch (err) {
      console.warn('Could not load school settings, using default:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  const updateSettings = async (newSettings: Partial<SchoolSettings>): Promise<SchoolSettings> => {
    const updated = await apiRequest<SchoolSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(newSettings),
    });
    setSettings(updated);
    return updated;
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        schoolName: settings.schoolName || 'School Management System',
        currencySymbol: settings.currencySymbol || '$',
        motto: settings.motto || 'Integrated Academic & Administrative Platform',
        loading,
        refreshSettings,
        updateSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
