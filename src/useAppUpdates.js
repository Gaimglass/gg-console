import { useCallback, useEffect, useRef, useState } from 'react';

const ipcRenderer = window.ipcRenderer;

export function useAppUpdates() {
  const [status, setStatus] = useState({ phase: 'idle', revision: -1 });
  const [requestPending, setRequestPending] = useState(false);
  const [installing, setInstalling] = useState(false);
  const mounted = useRef(false);
  const acceptStatus = useCallback(value => {
    if (!value?.phase) return;
    setStatus(previous => value.revision >= previous.revision ? value : previous);
  }, []);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const receiveStatus = value => {
      if (active) acceptStatus(value);
    };
    ipcRenderer.on('update-status', receiveStatus);
    void ipcRenderer.invoke('get-update-status').then(value => {
      if (active) acceptStatus(value);
    }).catch(() => {});
    return () => {
      active = mounted.current = false;
      ipcRenderer.removeListener('update-status', receiveStatus);
    };
  }, [acceptStatus]);

  const check = useCallback(async () => {
    setRequestPending(true);
    try {
      const result = await ipcRenderer.invoke('check-for-updates');
      if (mounted.current) acceptStatus(result);
    } catch {
      // Ignore updater failures and allow later checks to retry.
    } finally {
      if (mounted.current) setRequestPending(false);
    }
  }, [acceptStatus]);

  const restart = useCallback(async () => {
    setInstalling(true);
    try {
      await ipcRenderer.invoke('restart-and-update-app');
    } catch {
      // Leave the downloaded update available for another install attempt.
    } finally {
      if (mounted.current) setInstalling(false);
    }
  }, []);

  return {
    status, check, restart, installing,
    busy: requestPending || ['checking', 'downloading'].includes(status.phase),
  };
}
