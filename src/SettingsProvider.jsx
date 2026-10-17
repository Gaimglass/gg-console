import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadAppSettings,  saveAppSettings } from './Utils';

const ipcRenderer = window.ipcRenderer;

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const initialSettings = loadAppSettings();
  const [settings, setSettings] = useState(initialSettings);
  const [shortcutErrors, setShortcutErrors] = useState({});

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  // Send settings to Electron when they change
  useEffect(() => {
    // Send ADS settings
    ipcRenderer.invoke('set-enable-ads', settings.ads);
  }, [settings.ads]);

  useEffect(() => {
    let current = true;
    ipcRenderer.invoke('set-enable-shortcuts', settings.keyBindings).then(errors => {
      if (current) setShortcutErrors(errors || {});
    }).catch(error => console.warn('Could not register shortcuts:', error));
    return () => { current = false; };
  }, [settings.keyBindings]);

  useEffect(() => {
    ipcRenderer.invoke('set-overlay-settings', settings.overlay)
      .catch(error => console.warn('Could not configure overlay. Fully quit and reopen Gaimglass:', error));
  }, [settings.overlay]);

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
    setSettings(previous => ({ ...previous, keyBindings }));
  };

  const value = {
    settings,
    adsSettings: settings.ads,
    ambientSettings: settings.ambient,
    overlaySettings: settings.overlay,
    keyBindings: settings.keyBindings,
    shortcutErrors,
    updateShortcutErrors: setShortcutErrors,
    updateSettings,
    updateADSSettings,
    updateAmbientSettings,
    updateKeyBindings,
    updateOverlaySettings: overlay => setSettings(previous => ({ ...previous, overlay })),
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
