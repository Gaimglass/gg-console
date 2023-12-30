import styles from './css/DefaultRevertConfirm.module.css'

function DefaultRevertConfirm(props) {
  return   <div className={styles.confirmWrapper}>
      <div className={styles.confirm}>
        <button onClick={props.onReset} className={styles.reset}>Reset to Default</button>
        <button onClick={props.onDelete} className={styles.delete}>Delete Slot</button>
      </div> 
    </div>
}

export default DefaultRevertConfirm;