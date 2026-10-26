import { useEffect } from 'react';
import { useController } from './ControllerProvider';

const ipcRenderer = window.ipcRenderer;

// React only displays controller availability. ADS is processed in Electron main.
export default function ControllerMonitor() {
  const { setType } = useController();
  useEffect(() => {
    const handleControllerUpdate = gamepad => setType(gamepad.type);
    ipcRenderer.on('update-controller-event', handleControllerUpdate);
    return () => ipcRenderer.removeListener('update-controller-event', handleControllerUpdate);
  }, [setType]);
  return null;
}
