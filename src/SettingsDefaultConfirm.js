import styles from './css/SettingsDefaultConfirm.module.css'
import React, { useState } from 'react';

function DefaultRevertConfirm({
  onReset}) {
  const [confirm, setConfirm] = useState(false)

  function handleConfirm() {
    setConfirm(true)
  }
  function handleCancel() {
    setConfirm(false)
  }
  function handleReset() {
    setConfirm(false)
    onReset();
  }

  return   <div className={styles.confirmWrapper}>
      <div className={styles.confirm}>
        {!confirm && <button onClick={handleConfirm}>Reset Defaults</button>}
        {confirm && 
        <>
          <button onClick={handleReset} className={styles.reset}>Confirm</button>
          <button onClick={handleCancel} className={styles.cancel}>Cancel</button>
        </>
        }
        
      </div> 
    </div>
}

export default DefaultRevertConfirm;