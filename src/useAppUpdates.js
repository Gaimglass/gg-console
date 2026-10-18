import { useCallback, useEffect, useRef, useState } from 'react';

const ipcRenderer = window.ipcRenderer;

export function useAppUpdates() {
  const [status, setStatus] = useState({ phase: 'idle', revision: -1 });
  const [requestError, setRequestError] = useState('');
  const [requestPending, setRequestPending] = useState(false);
  const [installing, setInstalling] = useState(false);
  const mounted = useRef(false);
  const acceptStatus = useCallback(value => {
    if (!value?.phase) throw new Error('Fully exit Gaimglass from its tray menu and reopen it to load the updater.');
    setStatus(previous => value.revision >= previous.revision ? value : previous);
  }, []);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const receiveStatus = value => {
      if (active) {
        acceptStatus(value);
        setRequestError('');
      }
    };
    ipcRenderer.on('update-status', receiveStatus);
    void ipcRenderer.invoke('get-update-status').then(value => {
      if (active) acceptStatus(value);
    }).catch(() => {
      if (active) setRequestError('Could not contact the updater. Fully exit Gaimglass from its tray menu and reopen it.');
    });
    return () => {
      active = mounted.current = false;
      ipcRenderer.removeListener('update-status', receiveStatus);
    };
  }, [acceptStatus]);

  const check = useCallback(async () => {
    setRequestError('');
    setRequestPending(true);
    try {
      const result = await ipcRenderer.invoke('check-for-updates');
      if (mounted.current) acceptStatus(result);
    } catch (error) {
      if (mounted.current) setRequestError(error.message || 'Could not check for updates. Try again.');
    } finally {
      if (mounted.current) setRequestPending(false);
    }
  }, [acceptStatus]);

  const restart = useCallback(async () => {
    setRequestError('');
    setInstalling(true);
    try {
      const result = await ipcRenderer.invoke('restart-and-update-app');
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      if (mounted.current) setRequestError(error.message || 'Could not restart to install the update. Try again.');
    } finally {
      if (mounted.current) setInstalling(false);
    }
  }, []);

  return {
    status, check, restart, installing,
    busy: requestPending || ['checking', 'downloading'].includes(status.phase),
    error: requestError || status.error || '',
  };
}
