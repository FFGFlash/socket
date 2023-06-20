import Engine from './engine'
import EventEmitter from 'events'

export default abstract class Transport extends EventEmitter implements TransportOptions {
  abstract name: string
  agent
  path
  hostname
  port
  secure
  query
  timestampParam
  timestampRequests
  socket
  enablesXDR
  pfx
  key
  passphrase
  cert
  ca
  ciphers
  rejectUnauthorized
  forceNode
  extraHeader
  localAddress
  readyState = ReadyState.CLOSED
  writable = false
  #options: TransportOptions

  static readonly DefaultOptions: TransportOptions = {
    agent: false,
  }

  constructor(options: Partial<TransportOptions> = {}) {
    super()
    this.#options = Object.assign(Transport.DefaultOptions, options)

    this.agent = this.#options.agent
    this.path = this.#options.path
    this.hostname = this.#options.hostname
    this.port = this.#options.port
    this.secure = this.#options.secure
    this.query = this.#options.query
    this.timestampParam = this.#options.timestampParam
    this.timestampRequests = this.#options.timestampRequests
    this.socket = this.#options.socket
    this.enablesXDR = this.#options.enablesXDR
    this.pfx = this.#options.pfx
    this.key = this.#options.key
    this.passphrase = this.#options.passphrase
    this.cert = this.#options.cert
    this.ca = this.#options.ca
    this.ciphers = this.#options.ciphers
    this.rejectUnauthorized = this.#options.rejectUnauthorized
    this.forceNode = this.#options.forceNode
    this.extraHeader = this.#options.extraHeader
    this.localAddress = this.#options.localAddress
  }

  onError(msg: string, desc: string) {
    const err = new TransportError(msg, 'TransportError', desc)
    this.emit('error', err)
    return this
  }

  onOpen() {
    this.readyState = ReadyState.OPEN
    this.writable = true
    this.emit('open')
  }

  onData(data: any) {
    const packet = decodePacket(data, this.socket.binaryType)
    this.onPacket(packet)
  }

  onPacket(packet: Packet) {}

  onClose() {}

  open() {
    if (this.readyState !== ReadyState.CLOSED && (this.readyState as string) !== '') return this
    this.readyState = ReadyState.OPENING
    this.doOpen()
    return this
  }

  close() {
    if (this.readyState !== ReadyState.OPENING && this.readyState !== ReadyState.OPEN) return this
    this.doClose()
    this.onClose()
    return this
  }

  send(packets: Packet[]) {
    if (this.readyState !== ReadyState.OPEN) throw new Error('Transport not open')
    this.write(packets)
  }

  abstract write(packets: Packet[]): any
  abstract doOpen(): any
  abstract doClose(): any
}

export class TransportError extends Error {
  type: string
  description: string

  constructor(message: string, type: string, description: string) {
    super(message)
    this.type = type
    this.description = description
  }
}

export enum ReadyState {
  CLOSED = 'closed',
  OPENING = 'OPENING',
  OPEN = 'open',
}

export interface TransportOptions {
  agent: boolean
  path?: string
  hostname?: string
  port?: string
  secure?: boolean
  query?: string
  timestampParam?: string
  timestampRequests?: boolean
  socket?: Engine
  enablesXDR?: boolean
  pfx?: any
  key?: string
  passphrase?: string
  cert?: string
  ca?: string
  ciphers?: string
  rejectUnauthorized?: boolean
  forceNode?: boolean
  extraHeader?: string
  localAddress?: string
}
