export function normalizeOverlaySettings(value = {}) {
  return {
    enabled: value?.enabled !== false,
    fullscreenGames: (value?.fullscreenGames ?? value?.titanfall2) !== false,
  };
}
