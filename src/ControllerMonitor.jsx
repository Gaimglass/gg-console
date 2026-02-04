import { useEffect, useState, useRef } from "react";
import {useController} from './ControllerProvider';
import { useSettings } from "./SettingsProvider";


// XInput index to button string mapping
export const XINPUT_INDEX_BUTTON = {
  0: 'XINPUT_GAMEPAD_A',
  1: 'XINPUT_GAMEPAD_B',
  2: 'XINPUT_GAMEPAD_X',
  3: 'XINPUT_GAMEPAD_Y',
  4: 'XINPUT_GAMEPAD_LEFT_SHOULDER',
  5: 'XINPUT_GAMEPAD_RIGHT_SHOULDER',
  8: 'XINPUT_GAMEPAD_BACK',
  9: 'XINPUT_GAMEPAD_START',
  10: 'XINPUT_GAMEPAD_LEFT_THUMB',
  11: 'XINPUT_GAMEPAD_RIGHT_THUMB',
  12: 'XINPUT_GAMEPAD_DPAD_UP',
  13: 'XINPUT_GAMEPAD_DPAD_DOWN',
  14: 'XINPUT_GAMEPAD_DPAD_LEFT',
  15: 'XINPUT_GAMEPAD_DPAD_RIGHT',
  16: 'XINPUT_GAMEPAD_GUIDE', // Xbox logo (may not always be exposed)
};

// thresholds for analog trigger activation
const ADS_ON_THRESHOLD = 80;
const ADS_OFF_THRESHOLD = 60;

const ipcRenderer = window.ipcRenderer;


export default function ControllerMonitor({
  onADSDown,
  onADSUp,
}) {
  const isADSRef = useRef(false);
  const {type, setType} = useController();
  const { adsSettings } = useSettings();
  const [analogTriggerKey, setAnalogTriggerKey] = useState('');
  const [buttonTriggerKey, setButtonTriggerKey] = useState('');


  useEffect(() => {
    if (type === 'xinput') {
      if(adsSettings.adsControllerButton === 6) {
        /*eslint-disable-next-line react-hooks/exhaustive-deps */
        setAnalogTriggerKey('bLeftTrigger');
        setButtonTriggerKey(null)
      }
      else if(adsSettings.adsControllerButton === 7) {
        setAnalogTriggerKey('bRightTrigger');
        setButtonTriggerKey(null)
      }
      else {
        setButtonTriggerKey(XINPUT_INDEX_BUTTON[adsSettings.adsControllerButton] || null);
        setAnalogTriggerKey(null)
      }
    }  
  },[type, adsSettings.adsControllerButton]);
  



  useEffect(() => {
    if (!ipcRenderer) {
      console.warn("ipcRenderer not available on window");
      return;
    }

    /*
    xinput Example:
    gamepad.state = {
      "wButtons": [
          "XINPUT_GAMEPAD_A"
      ],
      "bLeftTrigger": 0,
      "bRightTrigger": 0,
      "sThumbLX": 281,
      "sThumbLY": 457,
      "sThumbRX": 0,
      "sThumbRY": 0
    }
    */
    const handleControllerUpdate = (gamepad) => {

      if (!gamepad.state) return;

      const isADS = isADSRef.current;

      if (type !== gamepad.type) {
        setType(gamepad.type);
      }
      
      
      if(analogTriggerKey) {
        // Left or Right Trigger Analog
        const trigger = gamepad.state[analogTriggerKey] ?? 0;
        if (!isADS && trigger > ADS_ON_THRESHOLD) {
          isADSRef.current = true;
          onADSDown?.();
          return;
        }
        if (isADS && trigger < ADS_OFF_THRESHOLD) {
          isADSRef.current = false;
          onADSUp?.();
        }
      } else {
        // Button-based ADS
        const trigger = gamepad.state.wButtons.includes(buttonTriggerKey) ? 1 : 0;
        if (!isADS && trigger === 1) {
          isADSRef.current = true;
          onADSDown?.();
          return;
        }
        if (isADS && trigger === 0) {
          isADSRef.current = false;
          onADSUp?.();
        }
      }
    };

    ipcRenderer.on(
      "update-controller-event",
      handleControllerUpdate
    );

    return () => {
      ipcRenderer.removeListener(
        "update-controller-event",
        handleControllerUpdate
      );
    };

  }, [onADSDown, type, setType, onADSUp, buttonTriggerKey, analogTriggerKey, adsSettings.adsControllerButton]);

  return null;
}