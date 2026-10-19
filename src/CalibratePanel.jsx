import { useEffect, useRef } from 'react';
import { RgbaColorPicker } from 'react-colorful';
import classNames from 'classnames';
import DefaultColors from './DefaultColors';
import DefaultRevertConfirm from './DefaultRevertConfirm';
import PowerSwitch from './assets/power-off-solid.svg?react';
import CrosshairsIcon from './assets/crosshair.svg?react';
import styles from './css/CalibratePanel.module.css';

export default function CalibratePanel({
  fullscreen, color, ledOn, onTogglePower, onOpenFullscreen,
  onPickerColorChange, onRgbChange, onAlphaChange,
  defaultColors, onDefaultColorChange, editSwatch, onSetEditSwatch,
  onDeleteDefaultColor, onResetDefaultColor, ...swatchEditor
}) {
  const pickerInteractionRef = useRef(false);

  useEffect(() => {
    pickerInteractionRef.current = false;
  }, [fullscreen]);

  function startPickerInteraction() {
    pickerInteractionRef.current = true;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.content}>
        <div className={styles.main}>
          <div className={styles.mainControls}>
            <button type="button" className={classNames(styles.power, {
              [styles.enabled]: ledOn,
              [styles.fullWidth]: fullscreen,
            })} onClick={onTogglePower}>
              <PowerSwitch className={styles.powerIcon} />
              <span className={styles.powerText}>LED: {ledOn ? ' ON ' : 'OFF'}</span>
            </button>
            {!fullscreen && <button type="button" className={styles.calibrate} onClick={onOpenFullscreen} aria-label="Open fullscreen calibration">
              <CrosshairsIcon className={styles.crosshairIcon} />
            </button>}
          </div>
          <div role="group" aria-label="Current color">
            <RgbaColorPicker
              color={color}
              onMouseDownCapture={startPickerInteraction}
              onTouchStartCapture={startPickerInteraction}
              onKeyDownCapture={startPickerInteraction}
              onChange={newColor => {
                // Controlled prop updates can emit stale callbacks after a device read.
                if (pickerInteractionRef.current) onPickerColorChange(newColor);
              }}
            />
          </div>
          <div className={styles.rgbInputs}>
            {['r', 'g', 'b', 'a'].map(channel => <label key={channel}>
              {channel.toUpperCase()}
              <input
                aria-label={`Current color ${channel.toUpperCase()}`}
                onChange={event => {
                  pickerInteractionRef.current = false;
                  if (channel === 'a') onAlphaChange(event);
                  else onRgbChange(event, channel);
                }}
                value={color[channel]}
                type="text"
                inputMode={channel === 'a' ? 'decimal' : 'numeric'}
              />
            </label>)}
          </div>
        </div>
        <DefaultColors
          {...swatchEditor}
          colors={defaultColors}
          editSwatch={editSwatch}
          onSetEditSwatch={onSetEditSwatch}
          onChangeColor={(newColor, index) => {
            pickerInteractionRef.current = false;
            onDefaultColorChange(newColor, index);
          }}
        />
      </div>
      {editSwatch !== null && <DefaultRevertConfirm
        onDelete={editSwatch !== 0 ? () => {
          onDeleteDefaultColor();
          onSetEditSwatch(null);
        } : undefined}
        onReset={() => {
          onResetDefaultColor();
          onSetEditSwatch(null);
        }}
      />}
    </div>
  );
}
