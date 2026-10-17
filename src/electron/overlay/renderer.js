const panel = document.getElementById('notification');
const label = document.getElementById('label');
const value = document.getElementById('value');
const track = document.getElementById('track');
const fill = document.getElementById('fill');
const slots = document.getElementById('slots');
const swatch = document.getElementById('swatch');
const brightnessIcon = document.getElementById('brightness-icon');
const powerIcon = document.getElementById('power-icon');

for (let index = 1; index <= 8; index++) slots.appendChild(document.createElement('span'));

window.actionOverlay.subscribe(notification => {
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
}, () => panel.classList.remove('visible'));
