import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadAppSettings,  saveAppSettings } from './Utils';

const ipcRenderer = window.ipcRenderer;

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const initialSettings = loadAppSettings();
  const [settings, setSettings] = useState(initialSettings);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  // Send settings to Electron when they change
  useEffect(() => {
    // Send ADS settings
    ipcRenderer.invoke('set-enable-ads', settings.ads);
    
    // Send keyboard shortcuts
    ipcRenderer.invoke('set-enable-shortcuts', settings.keyBindings);
  }, [settings.ads, settings.keyBindings]);

  const updateSettings = (newSettings) => {
    setSettings(newSettings);
    saveAppSettings(newSettings);
  };

  const updateADSSettings = (adsSettings) => {
    const newSettings = {
      ...settings,
      ads: adsSettings
    };
    updateSettings(newSettings);
  };

  const updateAmbientSettings = (ambientSettings) => {
    const newSettings = {
      ...settings,
      ambient: ambientSettings
    };
    updateSettings(newSettings);
  };

  const updateKeyBindings = (keyBindings) => {
    const newSettings = {
      ...settings,
      keyBindings: keyBindings
    };
    updateSettings(newSettings);
  };

  const value = {
    settings,
    adsSettings: settings.ads,
    ambientSettings: settings.ambient,
    keyBindings: settings.keyBindings,
    updateSettings,
    updateADSSettings,
    updateAmbientSettings,
    updateKeyBindings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
