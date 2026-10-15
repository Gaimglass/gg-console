function isFullscreenLayout(layout, tolerance = 2) {
  if (!layout?.bounds || !layout?.monitorBounds) return false;
  const { bounds, monitorBounds } = layout;
  const edges = rect => [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
  return bounds.width > 0 && bounds.height > 0 && monitorBounds.width > 0 && monitorBounds.height > 0
    && edges(bounds).every((edge, index) => Number.isFinite(edge) && Math.abs(edge - edges(monitorBounds)[index]) <= tolerance);
}

function selectGameWindow(windows, foreground, ownedProcessIds = [process.pid]) {
  return windows.find(window => window.hwnd === foreground
    && Number.isInteger(window.processId) && window.processId > 0 && !ownedProcessIds.includes(window.processId)
    && Number.isInteger(window.threadId) && window.threadId > 0 && typeof window.is64bit === 'boolean'
    && (window.graphics?.d3D9 === true || window.graphics?.d3D11 === true || window.graphics?.opengl === true)) || null;
}

module.exports = { isFullscreenLayout, selectGameWindow };
