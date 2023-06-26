import EventEmitter from 'events'
import BackOff from '../backoff/backoff'
import { Decoder, Encoder, Packet, Types } from '../parser/parser'
import on from '../shared/on'
import DataError from './dataError'
import { boundMethod } from 'autobind-decorator'
import Socket, { SocketOptions } from '../socket/socket'
import { indexOf } from '../shared/natives'
import Engine from '../engine/engine'

export enum ReadyStates {
  OPEN = 'open',
  OPENING = 'opening',
  CLOSED = 'closed',
}

export interface ManagerOptions {
  path: string
  reconnection?: boolean
  autoConnect?: boolean
  reconnectionAttempts: number
  reconnectionDelay: number
  reconnectionDelayMax: number
  randomizationFactor: number
  timeout: number
}

export default class Manager extends EventEmitter {
  options: ManagerOptions
  uri?: string
  autoConnect: boolean
  nsps: Record<string, Socket> = {}
  subs: Array<() => void> = []
  readyState = ReadyStates.CLOSED
  connecting: Socket[] = []
  lastPing: null | Date = null
  encoding = false
  reconnecting = false
  packetBuffer: Packet[] = []
  encoder = new Encoder()
  decoder = new Decoder()
  engine?: Engine
  skipReconnect?: boolean
  private backOff: BackOff
  #reconnection!: boolean
  #reconnectionAttempts!: number
  #reconnectionDelay!: number
  #reconnectionDelayMax!: number
  #randomizationFactor!: number
  #timeout!: number | false
  open: this['connect']
  close: this['disconnect']

  static readonly DefaultOptions: ManagerOptions = {
    path: '/socket.io',
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
  }

  constructor()
  constructor(uri: string)
  constructor(uri: string, options: Partial<ManagerOptions>)
  constructor(options: Partial<ManagerOptions>)
  constructor(uri?: Partial<ManagerOptions> | string, options: Partial<ManagerOptions> = {}) {
    super()
    if (uri && 'object' === typeof uri) {
      options = uri
      uri = undefined
    }
    options = this.options = Object.assign(structuredClone(Manager.DefaultOptions), options)
    this.open = this.connect.bind(this)
    this.close = this.disconnect.bind(this)
    this.reconnection = this.options.reconnection !== false
    this.reconnectionAttempts = this.options.reconnectionAttempts
    this.reconnectionDelay = this.options.reconnectionDelay
    this.reconnectionDelayMax = this.options.reconnectionDelayMax
    this.randomizationFactor = this.options.randomizationFactor
    this.backOff = new BackOff({
      min: this.reconnectionDelay,
      max: this.reconnectionDelayMax,
      jitter: this.randomizationFactor,
    })
    this.timeout = null == this.options.timeout ? 20000 : this.options.timeout
    this.uri = uri
    this.autoConnect = this.options.autoConnect !== false
    if (this.autoConnect) this.open()
  }

  private emitAll(...args: [string, ...any]) {
    this.emit.apply(this, args)
    for (let nsp in this.nsps) {
      if (!Object.prototype.hasOwnProperty.call(this.nsps, nsp)) continue
      this.nsps[nsp].emit.apply(this.nsps[nsp], args)
    }
  }

  private updateSocketIDs() {
    const socket = this.engine!
    for (let nsp in this.nsps) {
      if (!Object.prototype.hasOwnProperty.call(this.nsps, nsp)) continue
      this.nsps[nsp].id = socket.id
    }
  }

  private maybeReconnectOnOpen() {
    if (this.reconnecting || this.reconnection || this.backOff.attempts === 0) return
    this.reconnect()
  }

  connect(callback?: (err?: DataError) => void) {
    if (~this.readyState.indexOf('open')) return this
    this.engine = new Engine(this.uri, this.options)
    const socket = this.engine
    this.readyState = ReadyStates.OPENING
    this.skipReconnect = false

    const disconnectOpenSub = on(socket, 'open', () => {
      this.onOpen()
      callback?.()
    })

    const disconnectErrorSub = on(socket, 'error', (data: any) => {
      this.cleanup()
      this.readyState = ReadyStates.CLOSED
      this.emitAll('connect_error', data)
      if (callback) callback(new DataError('Connection Error', data))
      else this.maybeReconnectOnOpen()
    })

    if (false !== this.timeout) {
      const timeout = this.timeout
      const timer = setTimeout(() => {
        disconnectOpenSub()
        socket.close()
        socket.emit('error', 'timeout')
        this.emitAll('connect_timeout', timeout)
      }, timeout)
      this.subs.push(() => clearTimeout(timer))
    }

    this.subs.push(disconnectErrorSub)
    this.subs.push(disconnectOpenSub)

    return this
  }

  private onOpen() {
    this.cleanup()
    this.readyState = ReadyStates.OPEN
    this.emit('open')
    const socket = this.engine!
    this.subs.push(on(socket, 'data', this.onData))
    this.subs.push(on(socket, 'ping', this.onPing))
    this.subs.push(on(socket, 'pong', this.onPong))
    this.subs.push(on(socket, 'error', this.onError))
    this.subs.push(on(socket, 'close', this.onClose))
    this.subs.push(on(this.decoder, 'decoded', this.onDecoded))
  }

  @boundMethod
  private onPing() {
    this.lastPing = new Date()
    this.emitAll('ping')
  }

  @boundMethod
  private onPong() {
    this.emitAll('pong', new Date().valueOf() - (this.lastPing as Date).valueOf())
  }

  @boundMethod
  private onData(data: any) {
    this.decoder.add(data)
  }

  @boundMethod
  private onDecoded(packet: Packet) {
    this.emit('packet', packet)
  }

  @boundMethod
  private onError(err: Error) {
    this.emitAll('error', err)
  }

  @boundMethod
  private onClose(reason: string) {
    this.cleanup()
    this.backOff.reset()
    this.readyState = ReadyStates.CLOSED
    this.emit('close', reason)
    if (this.reconnection && !this.skipReconnect) this.reconnect()
  }

  private onReconnect() {
    this.reconnecting = false
    this.backOff.reset()
    this.updateSocketIDs()
    this.emitAll('reconnect', this.backOff.attempts)
  }

  socket(nsp: string, opts: SocketOptions) {
    const socket = this.nsps[nsp] || new Socket(this, nsp, opts)
    if (!this.nsps[nsp]) {
      this.nsps[nsp] = socket

      const onConnecting = () => {
        if (!~indexOf(this.connecting, socket)) this.connecting.push(socket)
      }

      socket.on('connecting', onConnecting)
      socket.on('connect', () => (socket.id = this.engine!.id))

      if (this.autoConnect) onConnecting()
    }
    return socket
  }

  destroy(socket: Socket) {
    const index = indexOf(this.connecting, socket)
    if (~index) this.connecting.splice(index, 1)
    if (this.connecting.length) return
    this.close()
  }

  async packet(packet: Packet) {
    if (packet.query && packet.type === Types.CONNECT) packet.nsp += `?${packet.query}`
    if (!this.encoding) {
      this.encoding = true
      const packets = await this.encoder.encode(packet)
      packets.forEach(data => this.engine!.write(data, packet.options))
      this.encoding = false
      this.processPacketQueue()
    } else {
      this.packetBuffer.push(packet)
    }
  }

  private processPacketQueue() {
    if (this.packetBuffer.length === 0 || this.encoding) return
    const packet = this.packetBuffer.shift()
    this.packet(packet!)
  }

  private cleanup() {
    this.subs.forEach(destroy => destroy())
    this.subs = []
    this.packetBuffer = []
    this.encoding = false
    this.lastPing = null
    this.decoder.destroy()
  }

  disconnect() {
    this.skipReconnect = true
    this.reconnecting = false
    if (ReadyStates.OPENING === this.readyState) this.cleanup()
    this.backOff.reset()
    this.readyState = ReadyStates.CLOSED
    this.engine?.close()
  }

  reconnect() {
    if (this.reconnecting || this.skipReconnect) return this
    if (this.backOff.attempts >= this.reconnectionAttempts) {
      this.backOff.reset()
      this.emitAll('reconnect_failed')
      this.reconnecting = false
      return this
    }
    const delay = this.backOff.duration
    this.reconnecting = true
    const timer = setTimeout(() => {
      if (this.skipReconnect) return
      this.emitAll('reconnect_attempt', this.backOff.attempts)
      this.emitAll('reconnecting', this.backOff.attempts)
      if (this.skipReconnect) return
      this.open(err => {
        if (err) {
          this.reconnecting = false
          this.reconnect()
          this.emitAll('reconnect_error', err.data)
        } else {
          this.onReconnect()
        }
      })
    }, delay)

    this.subs.push(() => clearTimeout(timer))
  }

  get reconnection() {
    return this.#reconnection
  }

  set reconnection(v) {
    this.#reconnection = !!v
  }

  get reconnectionAttempts() {
    return this.#reconnectionAttempts
  }

  set reconnectionAttempts(v) {
    this.#reconnectionAttempts = v
  }

  get reconnectionDelay() {
    return this.#reconnectionDelay
  }

  set reconnectionDelay(v) {
    this.#reconnectionDelay = v
    this.backOff?.setMin(v)
  }

  get reconnectionDelayMax() {
    return this.#reconnectionDelayMax
  }

  set reconnectionDelayMax(v) {
    this.#reconnectionDelayMax = v
    this.backOff?.setMax(v)
  }

  get randomizationFactor() {
    return this.#randomizationFactor
  }

  set randomizationFactor(v) {
    this.#randomizationFactor = v
    this.backOff?.setJitter(v)
  }

  get timeout() {
    return this.#timeout
  }

  set timeout(v) {
    this.#timeout = v
  }
}
