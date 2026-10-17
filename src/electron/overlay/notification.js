function normalizeNotification(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'brightness' && Number.isFinite(value.value)) {
    return { type: 'brightness', percent: Math.round(Math.max(0, Math.min(1, value.value)) * 100) };
  }
  if (value.type === 'power' && typeof value.on === 'boolean') {
    return { type: 'power', on: value.on };
  }
  if (value.type === 'color-slot' && Number.isInteger(value.slot) && value.slot >= 1 && value.slot <= 8) {
    const color = value.color;
    const rgb = color && ['r', 'g', 'b'].every(channel => Number.isFinite(color[channel]))
      ? Object.fromEntries(['r', 'g', 'b'].map(channel => [channel, Math.round(Math.max(0, Math.min(255, color[channel])))]))
      : null;
    return { type: 'color-slot', slot: value.slot, color: rgb };
  }
  return null;
}

module.exports = { normalizeNotification };
