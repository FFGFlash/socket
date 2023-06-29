import type ws from 'ws'
import type { ErrorEvent } from 'ws'
import { Packet, encodePacket } from '../parser/parser'
import Transport from '../transport'
import timestamp from '../../shared/timestamp'
import { encodeQuery } from '../../shared/parseQuery'
import debug from 'debug'

const info = debug('engine-client:websocket')

const BrowserWebSocket = global.WebSocket
let NodeWebSocket: typeof ws
try {
  NodeWebSocket = require('ws')
} catch (e) {}

export default class WebsocketTransport extends Transport {
  name: string = 'websocket'

  ws!: ws | WebSocket

  supportsBinary: boolean = true
  perMessageDeflate: any
  usingBrowserWebSocket: boolean

  constructor(options?: any) {
    super(options)
    const forceBase64 = options?.forceBase64
    if (forceBase64) this.supportsBinary = false
    this.perMessageDeflate = options?.perMessageDeflate
    this.usingBrowserWebSocket = !!BrowserWebSocket && !options.forceNode
  }

  write(packets: Packet[]) {
    this.writable = false

    const done = () => {
      this.emit('flush')
      setTimeout(() => {
        this.writable = true
        this.emit('drain')
      }, 0)
    }

    let total = packets.length
    for (let i = 0, l = total; i < l; i++) {
      const packet = packets[i]
      let options: any
      encodePacket(packet, this.supportsBinary, data => {
        if (!this.usingBrowserWebSocket) {
          options = {}
          if (packet.options) options.compress = packet.options.compress
          if (this.perMessageDeflate) {
            const len = typeof data === 'string' ? Buffer.byteLength(data) : (data as Buffer).length
            if (len < this.perMessageDeflate.threshold) options.compress = false
          }
        }

        try {
          if (this.usingBrowserWebSocket) this.ws.send(data as any)
          else this.ws.send(data as any, options)
        } catch (e) {
          info('websocket closed before onClose event')
        }

        --total || done()
      })
    }
  }

  doOpen() {
    if (!this.available) return
    const uri = this.uri
    const protocols = void 0
    const options: any = {
      agent: this.agent,
      perMessageDeflate: this.perMessageDeflate,
    }

    options.pfx = this.pfx
    options.key = this.key
    options.passphrase = this.passphrase
    options.cert = this.cert
    options.ca = this.ca
    options.ciphers = this.ciphers
    options.rejectUnauthorized = this.rejectUnauthorized
    if (this.extraHeaders) options.headers = this.extraHeaders
    if (this.localAddress) options.localAddress = this.localAddress

    try {
      this.ws = this.usingBrowserWebSocket ? new BrowserWebSocket(uri) : new NodeWebSocket(uri, protocols, options)
    } catch (err) {
      return this.emit('error', err)
    }

    if (this.ws.binaryType === undefined) this.supportsBinary = false

    if ('supports' in this.ws && (this.ws.supports as any)?.binary) {
      this.supportsBinary = true
      this.ws.binaryType = BinaryType.NodeBuffer
    } else this.ws.binaryType = BinaryType.ArrayBuffer

    this.addEventListeners()
  }

  doClose() {
    if (typeof this.ws === 'undefined') return
    this.ws.close()
  }

  addEventListeners() {
    this.ws.onopen = () => this.onOpen()
    this.ws.onclose = () => this.onClose()
    this.ws.onmessage = (e: MessageEvent<any> | ws.MessageEvent) => this.onData(e.data)
    this.ws.onerror = (e: Event | ErrorEvent) => this.onError('websocket error', e)
  }

  get uri() {
    const query: any = this.query || {}
    const schema = this.secure ? 'wss' : 'ws'
    let port = ''
    if (this.port && (('wss' === schema && Number(this.port) !== 443) || ('ws' === schema && Number(this.port) !== 80))) port = `:${this.port}`
    if (this.timestampRequests && this.timestampParam) query[this.timestampParam] = timestamp()
    if (!this.supportsBinary) query.b64 = 1
    let queryString = encodeQuery(query)
    if (queryString.length) queryString = `?${queryString}`
    const ipv6 = this.hostname?.indexOf(':') !== -1
    return `${schema}://${ipv6 ? `[${this.hostname}]` : this.hostname}${port}${this.path}${queryString}`
  }

  get available() {
    const WebSocket = this.usingBrowserWebSocket ? BrowserWebSocket : NodeWebSocket
    return !!WebSocket && !('__initialize' in WebSocket && this.name === WebsocketTransport.prototype.name)
  }
}

WebsocketTransport.prototype.name = 'websocket'

export enum BinaryType {
  NodeBuffer = 'nodebuffer',
  ArrayBuffer = 'arraybuffer',
}
