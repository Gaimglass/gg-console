import styles from './css/Updates.module.css';

export default function Updates({ updates }) {
  const { status, busy, check, restart, installing } = updates;
  const messages = {
    idle: 'Ready to check for updates.',
    checking: 'Checking for updates…',
    downloading: 'Downloading an update. You can keep using Gaimglass.',
    'up-to-date': 'You’re up to date.',
    ready: `Version ${status.releaseName || ''} is ready to install.`,
    unavailable: status.message,
  };
  return (
    <section className={styles.container} aria-labelledby="updates-heading">
      <h3 id="updates-heading">Software updates</h3>
      <p>Installed version: <strong>{status.currentVersion || 'Loading…'}</strong></p>
      <p role="status" aria-live="polite">{messages[status.phase] || messages.idle}</p>
      <div className={styles.actions}>
        <button type="button" onClick={check} disabled={busy || installing || status.updateAvailable || status.phase === 'unavailable'}>
          {status.phase === 'downloading' ? 'Downloading…' : busy ? 'Checking…' : 'Check for updates'}
        </button>
        {status.updateAvailable && <button type="button" onClick={restart} disabled={installing}>
          {installing ? 'Restarting…' : 'Restart and install'}
        </button>}
      </div>
      {status.checkedAt && <p className={styles.hint}>Last successful check: {new Date(status.checkedAt).toLocaleString()}</p>}
    </section>
  );
}
