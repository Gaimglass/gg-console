import styles from './css/UpdatesTabWrapper.module.css';

export default function UpdatesTabWrapper({ view }) {
  view(({ children, updates }) => {
    const { status, restart, installing } = updates;
    return (
      <div className={styles.container}>
        {children}
        {status.updateAvailable ? <div className={styles.ready} role="status">
          <span>Update ready: {status.releaseName}</span>
          <button type="button" onClick={restart} disabled={installing}>{installing ? 'Restarting…' : 'Restart and install'}</button>
        </div> : null}
      </div>
    );
  });
}
