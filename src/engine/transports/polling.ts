import { encodeQuery } from '../../shared/parseQuery'
import { Packet, Packets, PacketsList, decodePayload, encodePayload } from '../parser/parser'
import Transport, { ReadyState } from '../transport'
import timestamp from '../../shared/timestamp'

const hasXHR2 = (() => {
  const XMLHttpRequest = require('xmlhttprequest-ssl')
  const xhr = new XMLHttpRequest({ xdomain: false })
  return xhr.responseType !== null
})()

export default abstract class Polling extends Transport {
  name: string = 'polling'
  supportsBinary = true
  polling = false

  constructor(options?: any) {
    super(options)
    const forceBase64 = options && options.forceBase64
    if (!hasXHR2 || forceBase64) this.supportsBinary = false
  }

  write(packets: Packet[]) {
    this.writable = false
    const done = () => {
      this.writable = true
      this.emit('drain')
    }
    encodePayload(packets, this.supportsBinary, data => this.doWrite(data as any, done))
  }

  doOpen() {
    this.poll()
  }

  doClose() {
    const close = () => this.write([{ type: 'close' }])
    if (this.readyState === ReadyState.OPEN) close()
    else this.once('open', close)
  }

  pause(onPause?: () => void) {
    this.readyState = ReadyState.PAUSING

    const pause = () => {
      this.readyState = ReadyState.PAUSED
      onPause?.()
    }

    const pMask = 1,
      dMask = 1 << 1
    let total = +this.polling + +!this.writable * dMask
    if (total === 0) return pause()
    if (total & pMask) this.once('pollComplete', () => (total &= ~pMask) || pause())
    if (total & dMask) this.once('drain', () => (total &= ~dMask) || pause())
  }

  poll() {
    this.polling = true
    this.doPoll()
    this.emit('poll')
  }

  override onData(data: any) {
    console.log('~~', data)
    const done = (packet: Packet, index: number, total: number) => {
      console.log('~~', packet, this.readyState)
      if (this.readyState === ReadyState.OPENING) this.onOpen()
      if (packet.type === PacketsList[Packets.close]) {
        this.onClose()
        return false
      }
      this.onPacket(packet)
    }

    decodePayload(data, this.socket?.binaryType, done)
    if (this.readyState === ReadyState.CLOSED) return
    this.polling = false
    this.emit('pollComplete')
    if (this.readyState !== ReadyState.OPEN) return
    this.poll()
  }

  get uri() {
    const query: any = this.query || {}
    const schema = this.secure ? 'https' : 'http'
    let port = ''
    if (this.port && (('https' === schema && Number(this.port) !== 443) || ('http' === schema && Number(this.port) !== 80))) port = `:${this.port}`
    if (this.timestampRequests && this.timestampParam) query[this.timestampParam] = timestamp()
    if (!this.supportsBinary) query.b64 = 1
    let queryString = encodeQuery(query)
    if (queryString.length) queryString = `?${queryString}`
    const ipv6 = this.hostname?.indexOf(':') !== -1
    return `${schema}://${ipv6 ? `[${this.hostname}]` : this.hostname}${port}${this.path}${queryString}`
  }

  abstract doPoll(): void
  abstract doWrite(data: string | Buffer, done: () => void): void
}

Polling.prototype.name = 'polling'
