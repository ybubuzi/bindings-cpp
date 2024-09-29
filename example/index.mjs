import { SerialPort } from "./steam.mjs";
import { Worker, isMainThread } from "worker_threads";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);

if (isMainThread) {
  new Worker(__filename); 
} else {
  const port = new SerialPort({
    path: "COM1",
    baudRate: 230400,
    stopBits: 1,
    dataBits: 8,
  });
  port.on("data", (chunk) => {
    console.log(chunk);
  });
  setInterval(() => {
    const isOK = port.write(Buffer.from([1, 2, 3, 4, 5]),()=>{
      console.log('success')
    });
    console.log(isOK)
  }, 3000);
}
