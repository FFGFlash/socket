import EventEmitter from 'events'
import on from '../shared/on'
import { boundMethod } from 'autobind-decorator'
import { Packet, Types } from '../parser/parser'
import hasBinary from './hasBinary'
import Manager, { ReadyStates } from '../manager/manager'

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
  io: Manager
  nsp: string
  query?: string
  ids = 0
  acks: Record<number, () => void> = {}
  receiveBuffer: any[] = []
  sendBuffer: Packet[] = []
  connected = false
  json: this
  open: this['connect']
  close: this['disconnect']
  send: (...args: any[]) => boolean
  subs?: Array<() => void>
  flags?: any
  id?: string

  constructor(io: Manager, nsp: string, opts: SocketOptions) {
    super()
    this.io = io
    this.nsp = nsp
    this.json = this
    if (opts && opts.query) this.query = opts.query
    if (this.io.autoConnect) this.connect()

    this.open = this.connect.bind(this)
    this.close = this.disconnect.bind(this)
    this.send = this.emit.bind(this, 'message')
  }

  subEvents() {
    if (this.subs) return
    const io = this.io
    this.subs = [on(io, 'open', this.onOpen), on(io, 'packet', this.onPacket), on(io, 'close', this.onClose)]
  }

  connect() {
    if (!this.connected) {
      this.subEvents()
      this.io.open()
      if (ReadyStates.OPEN === this.io.readyState) this.onOpen()
      this.emit('connecting')
    }
    return this
  }

  disconnect() {
    if (this.connected) this.packet({ type: Types.DISCONNECT })
    this.destroy()
    if (this.connected) this.onClose('io client disconnect')
    return this
  }

  emit(...data: [string, ...any]) {
    const [event] = data
    if (Events.hasOwnProperty(event)) {
      return super.emit(event, ...data)
    }

    let type = Types.EVENT
    if (hasBinary(data)) type = Types.BINARY_EVENT
    const packet: Packet = { type, data }
    packet.options = {
      compress: !this.flags || false !== this.flags.compress,
    }

    if (typeof data[data.length - 1] === 'function') {
      this.acks[this.ids] = data.pop()
      packet.id = this.ids++
    }

    if (this.connected) this.packet(packet)
    else this.sendBuffer.push(packet)

    delete this.flags

    return false
  }

  packet(packet: Packet) {
    packet.nsp = this.nsp
    this.io.packet(packet)
  }

  compress(compress: boolean) {
    ;(this.flags = this.flags || {}).compress = compress
    return this
  }

  @boundMethod
  private onOpen() {
    if ('/' !== this.nsp) {
      if (this.query) this.packet({ type: Types.CONNECT, query: this.query })
      else this.packet({ type: Types.CONNECT })
    }
  }

  @boundMethod
  private onClose(reason: string) {
    this.connected = false
    delete this.id
    this.emit('disconnect', reason)
  }

  @boundMethod
  private onPacket(packet: Packet) {
    if (packet.nsp !== this.nsp) return
    switch (packet.type) {
      case Types.CONNECT:
        this.onConnect()
        break
      case Types.EVENT:
      case Types.BINARY_EVENT:
        this.onEvent(packet)
        break
      case Types.ACK:
      case Types.BINARY_ACK:
        this.onACK(packet)
        break
      case Types.DISCONNECT:
        this.onDisconnect()
        break
      case Types.ERROR:
        this.emit('error', packet.data)
        break
    }
  }

  private onEvent(packet: Packet) {
    const args = packet.data || []
    if (null != packet.id) args.push(this.ack(packet.id))
    if (this.connected) super.emit.apply(this, args)
    else this.receiveBuffer.push(args)
  }

  private ack(id: number) {
    let sent = false
    return (...data: any[]) => {
      if (sent) return
      sent = true
      const type = hasBinary(data) ? Types.BINARY_ACK : Types.ACK
      this.packet({ type, id, data })
    }
  }

  private onACK(packet: Packet) {
    if (typeof packet.id === 'undefined') return
    const ack = this.acks[packet.id]
    if ('function' !== typeof ack) return
    ack.apply(this, packet.data)
    delete this.acks[packet.id]
  }

  private onConnect() {
    this.connected = true
    this.emit('connect')
    this.emitBuffered()
  }

  private emitBuffered() {
    this.receiveBuffer.forEach(data => super.emit.apply(this, data))
    this.receiveBuffer = []
    this.sendBuffer.forEach(packet => this.packet(packet))
    this.sendBuffer = []
  }

  private onDisconnect() {
    this.destroy()
    this.onClose('io server disconnect')
  }

  private destroy() {
    if (this.subs) {
      this.subs.forEach(destroy => destroy())
      delete this.subs
    }
    this.io.destroy(this)
  }

  get disconnected() {
    return !this.connected
  }
}
