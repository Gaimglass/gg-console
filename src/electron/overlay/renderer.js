const panel = document.getElementById('notification');
const label = document.getElementById('label');
const value = document.getElementById('value');
const track = document.getElementById('track');
const fill = document.getElementById('fill');
const slots = document.getElementById('slots');
const swatch = document.getElementById('swatch');
const brightnessIcon = document.getElementById('brightness-icon');
const powerIcon = document.getElementById('power-icon');
let marker;
let animation;
let activeTiming;
let loopTimer;

function report(timing, stage, at, details = {}) {
  window.actionOverlay.reportTiming({ id: timing.id, sequence: timing.sequence, stage,
    rendererMs: at, rendererEpochMs: performance.timeOrigin + at,
    sinceReceivedMs: at - timing.receivedAt, ...details });
}

function stamp(sequence) {
  if (!marker) {
    marker = document.createElement('div');
    marker.setAttribute('aria-hidden', 'true');
    Object.assign(marker.style, { position: 'absolute', top: '0', left: '0', width: '8px', height: '2px', display: 'flex', zIndex: '2147483647', pointerEvents: 'none' });
    for (let index = 0; index < 4; index++) {
      const cell = document.createElement('span');
      Object.assign(cell.style, { width: '2px', height: '2px', flexShrink: '0' });
      marker.appendChild(cell);
    }
    document.body.appendChild(marker);
  }
  window.overlayFrameMarker.colors(sequence).forEach((rgb, index) => { marker.children[index].style.backgroundColor = `rgb(${rgb.join(',')})`; });
}

function monitorLoop() {
  if (loopTimer) return;
  const due = performance.now() + 250;
  loopTimer = setTimeout(() => {
    loopTimer = null;
    if (!activeTiming) return;
    const at = performance.now();
    if (at - due >= 75) report(activeTiming, 'loop-lag', at, { lagMs: at - due, hidden: document.hidden, visibility: document.visibilityState });
    monitorLoop();
  }, 250);
}

for (let index = 1; index <= 8; index++) slots.appendChild(document.createElement('span'));

window.actionOverlay.subscribe((notification, timing) => {
  const receivedAt = performance.now();
  const isBrightness = notification.type === 'brightness';
  const isSlot = notification.type === 'color-slot';
  brightnessIcon.toggleAttribute('hidden', !isBrightness);
  powerIcon.toggleAttribute('hidden', notification.type !== 'power');
  swatch.hidden = !isSlot;
  track.hidden = !isBrightness;
  slots.hidden = !isSlot;

  if (isBrightness) {
    label.textContent = 'Brightness';
    value.textContent = `${notification.percent}%`;
    track.setAttribute('aria-valuenow', notification.percent);
    fill.style.width = `${notification.percent}%`;
  } else if (isSlot) {
    label.textContent = 'Default color';
    value.textContent = `Color slot ${notification.slot}`;
    const color = notification.color;
    swatch.style.backgroundColor = color ? `rgb(${color.r}, ${color.g}, ${color.b})` : '#92ec7f';
    [...slots.children].forEach((slot, index) => slot.classList.toggle('selected', index + 1 === notification.slot));
  } else {
    label.textContent = 'Gaimglass LED';
    value.textContent = notification.on ? 'On' : 'Off';
  }
  panel.classList.add('visible');
  if (timing) {
    const domAt = performance.now();
    if (timing.frameMarker) stamp(timing.sequence);
    if (animation) {
      cancelAnimationFrame(animation);
      report(activeTiming, 'superseded-before-animation', domAt);
    }
    activeTiming = { ...timing, receivedAt };
    report(activeTiming, 'received', receivedAt, { hidden: document.hidden, visibility: document.visibilityState });
    report(activeTiming, 'dom-updated', domAt, { durationMs: domAt - receivedAt });
    animation = requestAnimationFrame(() => {
      animation = null;
      const at = performance.now();
      // This runs before painting. The pixel stamp, not rAF, proves frame content.
      report(activeTiming, 'animation-callback', at, { durationMs: at - domAt });
    });
    monitorLoop();
  }
}, () => {
  panel.classList.remove('visible');
  if (activeTiming) report(activeTiming, 'hidden', performance.now());
  if (animation) cancelAnimationFrame(animation);
  animation = null;
  activeTiming = null;
  clearTimeout(loopTimer);
  loopTimer = null;
});
