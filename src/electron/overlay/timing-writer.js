// Disk IO runs on a worker so a blocked native send cannot also block log delivery.
const fs = require('node:fs');
const { parentPort, workerData } = require('node:worker_threads');

let size = fs.existsSync(workerData.path) ? fs.statSync(workerData.path).size : 0;
parentPort.on('message', message => {
  if (message === null) { parentPort.close(); return; }
  const line = `${JSON.stringify(message)}\n`;
  if (size + Buffer.byteLength(line) > workerData.maxBytes) {
    fs.rmSync(`${workerData.path}.old`, { force: true });
    if (fs.existsSync(workerData.path)) fs.renameSync(workerData.path, `${workerData.path}.old`);
    size = 0;
  }
  fs.appendFileSync(workerData.path, line);
  size += Buffer.byteLength(line);
  parentPort.postMessage(1);
});
