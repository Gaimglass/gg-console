import styles from './css/DefaultRevertConfirm.module.css'

function DefaultRevertConfirm({
  onReset, 
  showDelete, 
  resetName="Reset to Default",
  onDelete, 
  id}) {
  return   <div className={styles.confirmWrapper}>
      <div className={styles.confirm}>
        {onReset && <button onClick={onReset.bind(id)} className={styles.reset}>{resetName}</button>}
        {  onDelete && <button onClick={onDelete.bind(id)} className={styles.delete}>Delete Slot</button>}
      </div> 
    </div>
}

export default DefaultRevertConfirm;