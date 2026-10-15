import { useEffect, useState } from 'react';
import Switch from 'react-switch';
import { useSettings } from './SettingsProvider';
import styles from './css/OverlaySettings.module.css';

const toggleAppearance = {
  onColor: '#86d3ff',
  onHandleColor: '#2693e6',
  handleDiameter: 30,
  uncheckedIcon: false,
  checkedIcon: false,
  boxShadow: '0px 1px 5px rgba(0, 0, 0, 0.6)',
  activeBoxShadow: '0px 0px 1px 10px rgba(0, 0, 0, 0.2)',
  height: 20,
  width: 48,
};

export default function OverlaySettings() {
  const { overlaySettings, updateOverlaySettings } = useSettings();
  const [error, setError] = useState('');
  const [backendAvailable, setBackendAvailable] = useState(true);

  useEffect(() => {
    let current = true;
    window.ipcRenderer.invoke('get-overlay-status').then(status => {
      if (!current) return;
      if (status?.revision !== 'fullscreen-v2') {
        setBackendAvailable(false);
        setError('Fully quit Gaimglass from its tray menu and reopen it to load the fullscreen overlay.');
      }
    }).catch(() => {
      if (!current) return;
      setBackendAvailable(false);
      setError('Fully quit Gaimglass from its tray menu and reopen it to load the fullscreen overlay.');
    });
    return () => { current = false; };
  }, []);

  async function preview(notification) {
    try {
      setError('');
      const shown = await window.ipcRenderer.invoke('preview-action-overlay', notification);
      if (!shown) setError('Could not show the overlay. Try restarting Gaimglass.');
    } catch {
      setError('Fully quit and reopen Gaimglass to use the new overlay.');
    }
  }

  return (
    <section className={styles.container}>
      <h3>On-screen feedback</h3>
      <p>Brightness, color slots, and LED power appear in the upper left for a few seconds after you change them.</p>
      <div className={styles.option}>
        <Switch
          {...toggleAppearance}
          id="overlay-feedback"
          className={styles.switch}
          checked={overlaySettings.enabled}
          onChange={enabled => updateOverlaySettings({ ...overlaySettings, enabled })}
        />
        <label htmlFor="overlay-feedback">Show on-screen feedback</label>
      </div>
      <div className={styles.option}>
        <Switch
          {...toggleAppearance}
          id="overlay-fullscreen-games"
          className={styles.switch}
          checked={overlaySettings.fullscreenGames}
          disabled={!overlaySettings.enabled}
          onChange={fullscreenGames => updateOverlaySettings({ ...overlaySettings, fullscreenGames })}
          aria-label="Enable fullscreen game overlay"
        />
        <label htmlFor="overlay-fullscreen-games">Enable fullscreen game overlay <small>Experimental</small></label>
      </div>
      <p className={styles.hint}>Automatically detects fullscreen games. Supports DX9, DX11, and OpenGL. DX12, Vulkan, and games that block overlays need additional support.</p>
      <fieldset className={styles.previews} disabled={!overlaySettings.enabled || !backendAvailable}>
        <legend>Preview</legend>
        <p>Try the display without changing your Gaimglass.</p>
        <div>
          <button type="button" onClick={() => preview({ type: 'brightness', value: 0.65 })}>Brightness</button>
          <button type="button" onClick={() => preview({ type: 'color-slot', slot: 3, color: { r: 20, g: 110, b: 255 } })}>Color slot</button>
          <button type="button" onClick={() => preview({ type: 'power', on: false })}>LED off</button>
        </div>
      </fieldset>
      <p className={styles.error} role="status">{error}</p>
    </section>
  );
}
