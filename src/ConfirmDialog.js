import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PropTypes } from "prop-types";
import styles from './css/DefaultColors.module.css'
import {ReactComponent as Edit} from './assets/pen-to-square-solid.svg';
import {ReactComponent as Cancel} from './assets/xmark-solid.svg';
import {ReactComponent as Check} from './assets/check-solid.svg';
import classNames from 'classnames';



function ConfirmDialog(props) {
  
   
  return (
    
    <div className={styles.confimBackground}>
     <div className={styles.confimDialog}>
      <p>text</p>
      <button>Okay</button>
      <button>Cancel</button>
     </div>
    </div>
  );
}

ConfirmDialog.propTypes = {

}


export default ConfirmDialog;

