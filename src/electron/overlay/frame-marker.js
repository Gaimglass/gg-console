// A pixel stamp identifies the DOM update actually captured by an offscreen paint.
// It lives in the transparent top-left margin and is erased before native delivery.
(function (root) {
  const WIDTH = 8;
  const HEIGHT = 2;
  const checksum = bytes => bytes.reduce((value, byte) => value ^ byte, 0x5a);

  function colors(sequence) {
    const bytes = [sequence >>> 24, (sequence >>> 16) & 255, (sequence >>> 8) & 255, sequence & 255];
    return [[17, 85, 221], bytes.slice(1), [bytes[0], checksum(bytes), 167], [221, 85, 17]];
  }

  function readAndErase(bitmap, width, height) {
    if (width < WIDTH || height < HEIGHT || bitmap.length !== width * height * 4) return null;
    const sx = width / 316;
    const sy = height / 112;
    const samples = Array.from({ length: 4 }, (_, index) => {
      const offset = (Math.floor(sy) * width + Math.floor((index * 2 + 1) * sx)) * 4;
      return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset], bitmap[offset + 3]];
    });
    const matches = (sample, expected) => sample[3] === 255 && expected.every((value, index) => sample[index] === value);
    let sequence = null;
    if (matches(samples[0], [17, 85, 221]) && matches(samples[3], [221, 85, 17])) {
      const bytes = [samples[2][0], ...samples[1].slice(0, 3)];
      if (samples[1][3] === 255 && matches(samples[2], [bytes[0], checksum(bytes), 167])) {
        sequence = (bytes[0] * 0x1000000 + bytes[1] * 0x10000 + bytes[2] * 0x100 + bytes[3]) >>> 0;
      }
    }
    // Also erase unrecognised stamps (e.g. during a scale change). Never guess an ID.
    for (let y = 0; y < Math.ceil(HEIGHT * sy); y++) bitmap.fill(0, y * width * 4, (y * width + Math.ceil(WIDTH * sx)) * 4);
    return sequence;
  }

  const marker = { colors, readAndErase, WIDTH, HEIGHT };
  if (typeof module !== 'undefined' && module.exports) module.exports = marker;
  else root.overlayFrameMarker = marker;
})(typeof window === 'undefined' ? globalThis : window);
