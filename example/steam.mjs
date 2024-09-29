import { Duplex } from "stream";
import loadBinding from 'bindings'
import { promisify } from "util";
const binding = loadBinding("bindings");
function allocNewReadPool(poolSize) {
  const pool = Buffer.allocUnsafe(poolSize);
  pool.fill(0)
  pool.used = 0;
  return pool;
}
const asyncOpen = promisify(binding.open);
const asyncRead = promisify(binding.read);
const asyncWrite = promisify(binding.write);

export class SerialPort extends Duplex {
  constructor(options, openCallback) {
    let settings = {
      autoOpen: true,
      endOnClose: false,
      highWaterMark: 64 * 1024,
      binding,
    };
    settings = {
      dataBits: 8,
      lock: true,
      stopBits: 1,
      parity: "none",
      rtscts: false,
      rtsMode: "handshake",
      xon: false,
      xoff: false,
      xany: false,
      hupcl: true,
      ...settings,
      ...options,
    };
    super({
      // 最高数据流，当数据达到该大小时，将导致读写暂停
      highWaterMark: settings.highWaterMark,
    });
    if (!settings.binding) {
      throw new TypeError('"Bindings" is invalid pass it as `options.binding`');
    }

    if (!settings.path) {
      throw new TypeError(`"path" is not defined: ${settings.path}`);
    }

    if (typeof settings.baudRate !== "number") {
      throw new TypeError(`"baudRate" must be a number: ${settings.baudRate}`);
    }

    this.settings = settings;

    this.opening = false;
    this.closing = false;
    this._pool = allocNewReadPool(this.settings.highWaterMark);
    this._kMinPoolSpace = 128;
    if (this.settings.autoOpen) {
      this.open(openCallback);
    }
  }
  

  open(openCallback) {
    if (this.isOpen) {
      return this._asyncError(new Error("Port is already open"), openCallback);
    }

    if (this.opening) {
      return this._asyncError(new Error("Port is opening"), openCallback);
    }

    const { highWaterMark, binding, autoOpen, endOnClose, ...openOptions } =
      this.settings;

    this.opening = true;
    asyncOpen(openOptions.path, openOptions).then(
      (port) => {
        this.port = port;
        this.opening = false;
        this.emit("open");
        if (openCallback) {
          openCallback.call(this);
        }
      },
      (err) => {
        this.opening = false;
        this._error(err, openCallback);
      }
    );
  }

  _error(err, callback) {
    if (callback) {
      callback.call(this, err);
    } else {
      this.emit("error", err);
    }
  }

  /**
   * 实现`_read`方法，当调用该类实例的on('data')事件时，将递归调用
   * @param {*} size
   */
  _read(bytesToRead) {
    if (  !this.port) {
      this.once("open", () => {
        this._read(bytesToRead);
      });
      return;
    }
    if (
      !this._pool ||
      this._pool.length - this._pool.used < this._kMinPoolSpace
    ) {
      this._pool = allocNewReadPool(this.settings.highWaterMark);
    }
    const pool = this._pool;
    const toRead = Math.min(pool.length - pool.used, bytesToRead);
    const start = pool.used;
    
    asyncRead(this.port, pool, start, toRead).then(
      (bytesRead) => {   
        if (!bytesRead || bytesRead === 0) {
          this.push(null);
          return;
        }
        pool.used += bytesRead;
        this.push(pool.slice(start, start + bytesRead));
      },
      (err) => {
        console.log(`err: `,err)
        this._read(bytesToRead);
      }
    );
  }
  write(data, encoding, callback){
    if (Array.isArray(data)) {
      data = Buffer.from(data)
    }
    if (typeof encoding === 'function') {
      return super.write(data, encoding)
    }
    return super.write(data, encoding, callback)
  }
  _write(data, encoding, callback) {
    
    asyncWrite(this.port, data).then(()=>{
      callback(null)
    },
    err=>{
      if (!err.canceled) {
        // this._disconnected(err)
      }
      callback(err)
    }
  )
  }
}
