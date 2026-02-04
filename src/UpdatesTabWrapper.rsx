import classNames from "classnames";
import styles from "./css/UpdatesTabWrapper.module.css";
import RotateLeft from "./assets/rotate-left-solid.svg?react";

const ipcRenderer = window.ipcRenderer;

export default function UpdatesTabWrapper({ view, render, destroy }) {
  // --- stable instance state ---
  let updateRequired = false;
  let releaseName = "";

  // --- actions ---
  function restart() {
    ipcRenderer.invoke("restart-and-update-app");
  }

  async function checkForUpdatesTabWrapper() {
    const result = await ipcRenderer.invoke("check-for-updates");
    if (result?.error) {
      updateRequired = false;
    } else if (result?.updateAvailable) {
      releaseName = result.releaseName;
      updateRequired = true;
    } else {
      updateRequired = false;
    }
    render();
  }

  // --- interval (created in main body) ---
  checkForUpdatesTabWrapper();

  const interval = setInterval(() => {
    checkForUpdatesTabWrapper();
  }, 1000 * 60 * 60); // once per hour


  // --- cleanup ---
  destroy(() => {
    clearInterval(interval);
  });

  // --- view ---
  view(({ children }) => {
    const show = updateRequired ? "visible" : "hidden";

    return (
      <div
        className={classNames({
          [styles.container]: true,
          [styles.restartRequired]: updateRequired,
        })}
      >
        {children}

        <div
          className={styles.buttonContainer}
          style={{ visibility: show }}
        >
          <span>New update ready: {releaseName}</span>
          <button onClick={restart} className={styles.update}>
            <RotateLeft className={styles.restart} />
            Restart required
          </button>
        </div>
      </div>
    );
  });
}
