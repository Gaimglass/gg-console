import styles from './css/UpdatesTabWrapper.module.css';

export default function UpdatesTabWrapper({ view }) {
  view(({ children, updates, onOpenUpdates }) => {
    const { status, error, restart, installing } = updates;
    return (
      <div className={styles.container}>
        {children}
        {status.updateAvailable ? <div className={styles.ready} role="status">
          <span>Update ready: {status.releaseName}</span>
          <button type="button" onClick={restart} disabled={installing}>{installing ? 'Restarting…' : 'Restart and install'}</button>
          {error && <button type="button" onClick={onOpenUpdates}>View update error</button>}
        </div> : error ? <div className={styles.error} role="status">
          <button type="button" onClick={onOpenUpdates}>Update check failed — view details</button>
        </div> : null}
      </div>
    );
  });
}
