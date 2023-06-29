import EventEmitter from 'events'
import Polling from './polling'
import debug from 'debug'
var XMLHttpRequest = require('xmlhttprequest-ssl')

const info = debug('engine-client:polling-xhr')

export default class XHRTransport extends Polling {
  requestTimeout: any
  xd?: boolean
  xs?: boolean
  pollXhr?: Request
  sendXhr?: Request

  constructor(options?: any) {
    super(options)
    this.requestTimeout = options.requestTimeout
    if (global.location) {
      const isSSL = global.location.protocol === 'https:'
      const port = global.location.port || isSSL ? '443' : '80'
      this.xd = options.hostname !== global.location.hostname || port !== options.port
      this.xs = options.secure !== isSSL
    } else {
      this.extraHeaders = options.extraHeaders
    }
  }

  request(options: any = {}) {
    options = options || {}
    options.uri = this.uri
    options.xd = this.xd
    options.xs = this.xs
    options.agent = this.agent
    options.supportsBinary = this.supportsBinary
    options.enablesXDR = this.enablesXDR

    options.pfx = this.pfx
    options.key = this.key
    options.passphrase = this.passphrase
    options.cert = this.cert
    options.ca = this.ca
    options.ciphers = this.ciphers
    options.rejectUnauthorized = this.rejectUnauthorized
    options.requestTimeout = this.requestTimeout

    options.extraHeaders = this.extraHeaders

    return new Request(options)
  }

  doPoll(): void {
    info('xhr poll')
    const req = (this.pollXhr = this.request())
    req.on('data', data => this.onData(data))
    req.on('error', err => this.onError('xhr poll error', err))
  }

  doWrite(data: string | Buffer, done: () => void): void {
    const isBinary = typeof data !== 'string' && data !== undefined
    const req = (this.sendXhr = this.request({ method: 'POST', data, isBinary }))
    req.on('success', done)
    req.on('error', err => this.onError('xhr post error', err))
  }
}

class Request extends EventEmitter {
  index?: number
  method: string
  uri: string
  xd: boolean
  xs: boolean
  async: boolean
  data: any
  agent: any
  isBinary: any
  supportsBinary: any
  enablesXDR: any
  requestTimeout: any
  pfx: any
  key: any
  passphrase: any
  cert: any
  ca: any
  ciphers: any
  rejectUnauthorized: any
  extraHeaders: any
  xhr?: XMLHttpRequest
  abort

  static requestCount: number = 0
  static requests: Record<number, Request> = {}

  constructor(options: any) {
    super()
    this.method = options.method || 'GET'
    this.uri = options.uri
    this.xd = !!options.xd
    this.xs = !!options.xs
    this.async = options.async !== false
    this.data = options.data !== undefined ? options.data : null
    this.agent = options.agent
    this.isBinary = options.isBinary
    this.supportsBinary = options.supportsBinary
    this.enablesXDR = options.enablesXDR
    this.requestTimeout = options.requestTimeout
    this.pfx = options.pfx
    this.key = options.key
    this.passphrase = options.passphrase
    this.cert = options.cert
    this.ca = options.ca
    this.ciphers = options.cipher
    this.rejectUnauthorized = options.rejectUnauthorized
    this.extraHeaders = options.extraHeaders
    this.abort = this.cleanup.bind(this)
    this.create()
  }

  create() {
    const options = {
      agent: this.agent,
      xdomain: this.xd,
      xscheme: this.xs,
      enablesXDR: this.enablesXDR,
      pfx: this.pfx,
      key: this.key,
      passphrase: this.passphrase,
      cert: this.cert,
      ca: this.ca,
      ciphers: this.ciphers,
      rejectUnauthorized: this.rejectUnauthorized,
    }

    const xhr = (this.xhr = new XMLHttpRequest(options))

    try {
      info('xhr open %s: %s', this.method, this.uri)
      xhr.open(this.method, this.uri, this.async)

      try {
        if (this.extraHeaders) {
          xhr.setDisableHeaderCheck(true)
          for (let i in this.extraHeaders) {
            if (!this.extraHeaders.hasOwnProperty(i)) continue
            xhr.setRequestHeader(i, this.extraHeaders[i])
          }
        }
      } catch (e) {}

      if (this.supportsBinary) {
        xhr.responseType = 'arraybuffer'
      }

      if (this.method === 'POST') {
        try {
          if (this.isBinary) xhr.setRequestHeader('Content-type', 'application/octet-stream')
          else xhr.setRequestHeader('Content-type', 'text/plain;charset=UTF-8')
        } catch (e) {}
      }

      try {
        xhr.setRequestHeader('Accept', '*/*')
      } catch (e) {}

      if ('withCredentials' in xhr) xhr.withCredentials = true
      if (this.requestTimeout) xhr.timeout = this.requestTimeout

      if (this.hasXDR()) {
        xhr.onload = () => this.onLoad()
        xhr.onerror = () => this.onError(xhr.responseText)
      } else {
        xhr.onreadystatechange = () => {
          if (xhr.readyState !== 4) return
          if (xhr.status === 200 || xhr.status === 1223) return this.onLoad()
          setTimeout(() => this.onError(xhr.status), 0)
        }
      }

      info('xhr data %s', this.data)
      xhr.send(this.data)
    } catch (e) {
      setTimeout(() => this.onError(e), 0)
      return
    }

    if (!global.document) return
    this.index = Request.requestCount++
    Request.requests[this.index] = this
  }

  onSuccess() {
    this.emit('success')
    this.cleanup()
  }

  onData(data: any) {
    this.emit('data', data)
    this.onSuccess()
  }

  onError(err: any) {
    this.emit('error', err)
    this.cleanup(true)
  }

  onLoad() {
    const xhr = this.xhr!
    let data
    try {
      let contentType
      try {
        contentType = xhr.getResponseHeader('Content-Type')?.split(';')[0]
      } catch (e) {}
      if (contentType === 'application/octet-stream') {
        data = xhr.response || xhr.responseText
      } else {
        if (!this.supportsBinary) data = xhr.responseText
        else {
          try {
            data = String.fromCharCode.apply(null, new Uint8Array(xhr.response) as never as number[])
          } catch (e) {
            const ui8 = new Uint8Array(xhr.response)
            const dArr = []
            for (let i = 0, l = ui8.length; i < l; i++) dArr.push(ui8[i])
            data = String.fromCharCode.apply(null, dArr)
          }
        }
      }
    } catch (e) {
      this.onError(e)
    }
    if (data != null) this.onData(data)
  }

  hasXDR() {
    return typeof (global as any).XDomainRequest !== 'undefined' && !this.xd && this.enablesXDR
  }

  cleanup(error?: boolean) {
    if (typeof this.xhr === 'undefined') return
    if (this.hasXDR()) this.xhr.onload = this.xhr.onerror = () => {}
    else this.xhr.onreadystatechange = () => {}
    if (error)
      try {
        this.xhr.abort()
      } catch (e) {}

    if (global.document) delete Request.requests[this.index!]
    this.xhr = undefined
  }
}

function unloadHandler() {
  for (let i in Request.requests) {
    if (!Request.requests.hasOwnProperty(i)) continue
    Request.requests[i].abort()
  }
}

if (global.document) {
  if ((global as any).attachEvent) (global as any).attachEvent('onunload', unloadHandler)
  else if (global.addEventListener) global.addEventListener('beforeunload', unloadHandler, false)
}
