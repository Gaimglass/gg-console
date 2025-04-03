/* eslint-disable */

const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline');

let port = null;

// simulate a occupied port
async function main() {  
  const ports =  await SerialPort.list();
  let path = '';
  console.log(ports)
  for (let i = 0; i < ports.length; i++) {
    const vendorId = ports[i].vendorId;
    const productId = ports[i].productId;
    // hard coded to Arduino (2341) and 5400 for now
    
    // TODO do not consider the productID for now so we can connect to any arduino. Note this will always connect to the
    // first one found so you must only connect one at a time.
    
    if (productId === '5400' && vendorId === '2341') {
      console.log({productId, vendorId})
      path = ports[i]?.path;
      break;
    }
    else {
    }
  }
  if (path) {
    console.log("path found, connecting to port: ", path)
    port = new SerialPort({
      path,
      baudRate: 1200//115200,
    })

    port.on('error', (e) => {
      console.log("port error")
      console.log(e.message)
    })

    // todo, is this \n or \r\n ?
    let parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    // Read the port data
    port.on("open", async () => {
      
      setTimeout(()=>{
        // bootloader test. Connect at baud 1200 then disconnect to observe ATMega reboot
        clearInterval(intervalId);
        intervalId = null;
        disconnectUsb();
      },100)

      console.log("PORT OPEN", port.isOpen)
      if (!port.isOpen) {
        throw new Error('Port did not open correctly')
      }
        
      console.log('Seral port open');
    });

    port.on("close", (options) => {
      console.log('Serial port closed');
      
      port = null;
      
    });
    
    
  } else {
    console.log('not found');
    return false;
  }
}

main();