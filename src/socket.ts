import EventEmitter from 'events'
import on from './on'
import { boundMethod } from 'autobind-decorator'
import { Types } from './parser'

export enum Events {
  connect = 1,
  connect_error = 1,
  connect_timeout = 1,
  connecting = 1,
  disconnect = 1,
  error = 1,
  reconnect = 1,
  reconnect_attempt = 1,
  reconnect_failed = 1,
  reconnect_error = 1,
  reconnecting = 1,
  ping = 1,
  pong = 1,
}

export interface SocketOptions {
  query?: string
}

export default class Socket extends EventEmitter {
  io: any
  nsp: string
  query?: string
  ids = 0
  acks = {}
  receiveBuffer = []
  sendBuffer = []
  connected = false
  disconnected = true
  json: this
  open: this['connect']
  close: this['disconnect']
  subs?: Array<() => void>

  constructor(io: any, nsp: string, opts: SocketOptions) {
    super()
    this.io = io
    this.nsp = nsp
    this.json = this
    if (opts && opts.query) this.query = opts.query
    if (this.io.autoConnect) this.connect()

    this.open = this.connect.bind(this)
    this.close = this.disconnect.bind(this)
  }

  subEvents() {
    if (this.subs) return
    const io = this.io
    this.subs = [on(io, 'open', this.onOpen), on(io, 'packet', this.onPacket), on(io, 'close', this.onClose)]
  }

  connect() {}

  disconnect() {}

  emit(event: string, ...args: any[]) {
    if (Events.hasOwnProperty(event)) {
      return super.emit(event, ...args)
    }

    let parserType = Types.EVENT

    return false
  }

  @boundMethod
  private onOpen() {}

  @boundMethod
  private onPacket() {}

  @boundMethod
  private onClose() {}
}
