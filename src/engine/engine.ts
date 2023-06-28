import EventEmitter from 'events'
import { decodeQuery } from '../shared/parseQuery'
import parseUri from '../shared/parseURI'
import { Packet, Packets, PacketsList, Protocol } from './parser/parser'
import transports from './transports'
import Transport from './transport'
import { boundMethod } from 'autobind-decorator'

export default class Engine extends EventEmitter {
  secure: boolean
  agent: boolean
  hostname: string
  port: string
  query: any
  upgrade: boolean
  path: string
  forceJSONP: boolean
  jsonp: boolean
  forceBase64: boolean
  enablesXDR: boolean
  timestampParam: any
  timestampRequests: any
  transports: any
  readyState: string
  writeBuffer: any[]
  prevBufferLen: number
  policyPort: any
  rememberUpgrade: any
  binaryType?: string
  onlyBinaryUpgrades: any
  perMessageDeflate: any
  pfx: any
  key: any
  passphrase: any
  cert: any
  ca: any
  ciphers: any
  rejectUnauthorized: any
  forceNode: boolean
  extraHeaders: any
  localAddress: any
  id?: string
  upgrades?: any
  pingInterval?: any
  pingTimeout?: any
  pingIntervalTimer?: any
  pingTimeoutTimer?: any
  upgrading = false
  write

  #transport?: Transport

  static priorWebsocketSuccess = false
  static protocol = Protocol

  constructor(uri?: Partial<EngineOptions> | string, options?: Partial<EngineOptions>) {
    super()
    this.write = this.send.bind(this)

    options = options || {}

    if (uri && typeof uri === 'object') {
      options = uri
      uri = undefined
    }

    if (uri) {
      const puri = parseUri(uri)
      options.hostname = puri.host
      options.secure = puri.protocol === 'https' || puri.protocol === 'wss'
      options.port = puri.port
      if (puri.query) options.query = puri.query
    } else if (options.host) {
      options.hostname = parseUri(options.host).host
    }

    this.secure = options.secure != null ? options.secure : global.location && global.location.protocol === 'https:'
    if (options.hostname && !options.port) options.port = this.secure ? '443' : '80'

    this.agent = options.agent || false
    this.hostname = options.hostname || global.location?.hostname || 'localhost'
    this.port = options.port || global.location?.port || (this.secure ? '443' : '80')
    this.query = (typeof options.query === 'string' ? decodeQuery(options.query) : options.query) || {}
    this.upgrade = options.upgrade !== false
    this.path = (options.path || '/engine.io').replace(/\/$/, '') + '/'
    this.forceJSONP = !!options.forceJSONP
    this.jsonp = options.jsonp !== false
    this.forceBase64 = !!options.forceBase64
    this.enablesXDR = !!options.enablesXDR
    this.timestampParam = options.timestampParam || 't'
    this.timestampRequests = options.timestampRequests
    this.transports = options.transports || ['polling', 'websocket']
    this.readyState = ''
    this.writeBuffer = []
    this.prevBufferLen = 0
    this.policyPort = options.policyPort || 843
    this.rememberUpgrade = options.rememberUpgrade || false
    this.binaryType = undefined
    this.onlyBinaryUpgrades = options.onlyBinaryUpgrades
    this.perMessageDeflate = options.perMessageDeflate !== false ? options.perMessageDeflate || {} : false
    if (this.perMessageDeflate === true) this.perMessageDeflate = {}
    if (this.perMessageDeflate && this.perMessageDeflate.threshold === undefined) this.perMessageDeflate.threshold = 1024
    this.pfx = options.pfx || undefined
    this.key = options.key || undefined
    this.passphrase = options.passphrase || undefined
    this.cert = options.cert || undefined
    this.ca = options.ca || undefined
    this.ciphers = options.ciphers || undefined
    this.rejectUnauthorized = options.rejectUnauthorized === undefined ? undefined : options.rejectUnauthorized
    this.forceNode = !!options.forceNode

    const freeGlobal = typeof global === 'object' && global
    if (freeGlobal && freeGlobal.global === freeGlobal) {
      if (options.extraHeaders && Object.keys(options.extraHeaders).length > 0) {
        this.extraHeaders = options.extraHeaders
      }

      if (options.localAddress) {
        this.localAddress = options.localAddress
      }
    }

    this.open()
  }

  createTransport(name: keyof typeof transports) {
    const query = structuredClone(this.query)
    query.EIO = Protocol
    query.transport = name
    if (this.id) query.sid = this.id
    return transports[name]({
      agent: this.agent,
      hostname: this.hostname,
      port: this.port,
      secure: this.secure,
      path: this.path,
      query,
      forceJSONP: this.forceJSONP,
      jsonp: this.jsonp,
      forceBase64: this.forceBase64,
      enablesXDR: this.enablesXDR,
      timestampRequests: this.timestampRequests,
      timestampParam: this.timestampParam,
      policyPort: this.policyPort,
      socket: this,
      pfx: this.pfx,
      key: this.key,
      passphrase: this.passphrase,
      cert: this.cert,
      ca: this.ca,
      ciphers: this.ciphers,
      rejectUnauthorized: this.rejectUnauthorized,
      perMessageDeflate: this.perMessageDeflate,
      extraHeaders: this.extraHeaders,
      forceNode: this.forceNode,
      localAddress: this.localAddress,
    })
  }

  open() {
    let transport
    if (this.rememberUpgrade && Engine.priorWebsocketSuccess && this.transports.indexOf('websocket') !== '-1') {
      transport = 'websocket'
    } else if (this.transports.length === 0) {
      setTimeout(() => {
        this.emit('error', 'No transports available')
      }, 0)
      return
    } else {
      transport = this.transports[0]
    }
    this.readyState = ReadyState.OPENING

    try {
      transport = this.createTransport(transport)
    } catch (e) {
      this.transports.shift()
      this.open()
      return
    }

    transport.open()
    this.transport = transport
  }

  probe(name: keyof typeof transports) {
    let transport: Transport | undefined = this.createTransport(name)
    let failed = false

    Engine.priorWebsocketSuccess = false

    const onTransportOpen = () => {
      if (!transport) return

      if (this.onlyBinaryUpgrades) {
        const upgradeLossesBinary = !transport.supportsBinary && this.transport!.supportsBinary
        failed = failed || upgradeLossesBinary
      }
      if (failed) return

      transport.send([{ type: 'ping', data: 'probe' }])
      transport.once('packet', packet => {
        if (failed) return
        if (packet.type === PacketsList[Packets.pong] && packet.data === 'probe') {
          this.upgrading = true
          this.emit('upgrading', transport)
          if (!transport) return
          Engine.priorWebsocketSuccess = transport.name === 'websocket'
          this.transport?.pause?.(() => {
            if (failed || this.readyState === ReadyState.CLOSED || !transport) return
            cleanup()
            this.transport = transport
            transport.send([{ type: PacketsList[Packets.upgrade] as 'upgrade' }])
            this.emit('upgrade', transport)
            transport = undefined
            this.upgrading = false
            this.flush()
          })
        } else {
          const error = new ProbeError(transport?.name as keyof typeof transports)
          this.emit('upgradeError', error)
        }
      })
    }

    const freezeTransport = () => {
      if (failed) return
      failed = true
      cleanup()
      transport?.close()
      transport = undefined
    }

    const onError = (err: any) => {
      const error = new ProbeError(transport?.name, err)
      freezeTransport()
      this.emit('upgradeError', error)
    }

    const onTransportClose = () => onError('transport closed')

    const onClose = () => onError('socket closed')

    const onUpgrade = (to: Transport) => {
      if (transport && to.name !== transport.name) {
        freezeTransport()
      }
    }

    const cleanup = () => {
      transport?.removeListener('open', onTransportOpen)
      transport?.removeListener('error', onError)
      transport?.removeListener('close', onTransportClose)
      this.removeListener('close', onClose)
      this.removeListener('upgrading', onUpgrade)
    }

    transport.once('open', onTransportOpen)
    transport.once('error', onError)
    transport.once('close', onTransportClose)
    this.once('close', onClose)
    this.once('upgrading', onUpgrade)

    transport.open()
  }

  @boundMethod
  private onOpen() {
    this.readyState = ReadyState.OPEN
    Engine.priorWebsocketSuccess = this.transport?.name === 'websocket'
    this.emit('open')
    this.flush()

    if (this.readyState !== ReadyState.OPEN || !this.upgrade || !this.transport || !('pause' in this.transport)) return
    for (let i = 0, l = this.upgrades.length; i < l; i++) this.probe(this.upgrades[i])
  }

  @boundMethod
  private onPacket(packet: Packet) {
    if (this.readyState !== ReadyState.OPENING && this.readyState !== ReadyState.OPEN && this.readyState !== ReadyState.CLOSING) return
    this.emit('packet', packet)
    this.emit('heartbeat')
    switch (packet.type as Packet['type'] | 'error') {
      case PacketsList[Packets.open]:
        this.onHandshake(JSON.parse(packet.data))
        break
      case PacketsList[Packets.pong]:
        this.setPing()
        this.emit('pong')
        break
      case 'error':
        this.onError(new ServerError('server error', packet.data))
        break
      case PacketsList[Packets.message]:
        this.emit('data', packet.data)
        this.emit('message', packet.data)
        break
    }
  }

  private onHandshake(data: any) {
    this.emit('handshake', data)
    this.id = data.sid
    this.transport!.query.sid = data.sid
    this.upgrades = this.filterUpgrades(data.upgrades)
    this.pingInterval = data.pingInterval
    this.pingTimeout = data.pingTimeout
    this.onOpen()
    if (this.readyState === ReadyState.CLOSED) return
    this.setPing()
    this.removeListener('heartbeat', this.onHeartbeat)
    this.on('heartbeat', this.onHeartbeat)
  }

  @boundMethod
  private onHeartbeat(timeout?: number) {
    clearTimeout(this.pingTimeoutTimer)
    this.pingTimeoutTimer = setTimeout(() => {
      if (this.readyState === ReadyState.CLOSED) return
      this.onClose('ping timeout')
    }, timeout || this.pingInterval + this.pingTimeout)
  }

  @boundMethod
  private onError(err: any) {
    Engine.priorWebsocketSuccess = false
    this.emit('error', err)
    this.onClose('transport error', err)
  }

  @boundMethod
  private onDrain() {
    this.writeBuffer.splice(0, this.prevBufferLen)
    this.prevBufferLen = 0
    if (this.writeBuffer.length === 0) this.emit('drain')
    else this.flush()
  }

  private onClose(reason: string, desc?: any) {
    if (this.readyState !== ReadyState.OPENING && this.readyState !== ReadyState.OPEN && this.readyState !== ReadyState.CLOSING) return

    clearTimeout(this.pingIntervalTimer)
    clearTimeout(this.pingTimeoutTimer)

    this.transport?.removeAllListeners('close')
    this.transport?.close()
    this.transport?.removeAllListeners()
    this.readyState = ReadyState.CLOSED
    this.id = undefined
    this.emit('close', reason, desc)
    this.writeBuffer = []
    this.prevBufferLen = 0
  }

  private filterUpgrades(upgrades: any[]) {
    return upgrades.filter(upgrade => ~this.transports.indexOf(upgrade))
  }

  private setPing() {
    clearTimeout(this.pingIntervalTimer)
    this.pingIntervalTimer = setTimeout(() => {
      this.ping()
      this.onHeartbeat(this.pingTimeout)
    }, this.pingInterval)
  }

  private ping() {
    this.sendPacket('ping', () => this.emit('ping'))
  }

  private flush() {
    if (this.readyState === ReadyState.CLOSED || !this.transport!.writable || this.upgrading || !this.writeBuffer.length) return
    this.transport!.send(this.writeBuffer)
    this.prevBufferLen = this.writeBuffer.length
    this.emit('flush')
  }

  send(message?: string, options?: any, callback = () => {}) {
    this.sendPacket('message', message, options, callback)
    return this
  }

  sendPacket(type: Packet['type'], data?: any, options?: any, callback = () => {}) {
    if (typeof data === 'function') {
      callback = data
      data = undefined
    }

    if (typeof options === 'function') {
      callback = options
      options = undefined
    }

    if (this.readyState === ReadyState.CLOSING || this.readyState === ReadyState.CLOSED) return

    options = options || {}
    options.compress = options.compress !== false
    const packet = {
      type,
      data,
      options,
    }
    this.emit('packetCreate', packet)
    this.writeBuffer.push(packet)
    if (callback) this.once('flush', callback)
    this.flush()
  }

  get transport() {
    return this.#transport
  }

  set transport(transport: Transport | undefined) {
    if (this.#transport) this.#transport.removeAllListeners()
    this.#transport = transport
    if (!transport) return
    transport
      .on('drain', this.onDrain)
      .on('packet', this.onPacket)
      .on('error', this.onError)
      .on('close', () => this.onClose('transport close'))
  }

  close() {
    const close = () => {
      this.onClose('forced close')
      this.transport?.close()
    }

    const cleanupAndClose = () => {
      this.removeListener('upgrade', cleanupAndClose)
      this.removeListener('upgradeError', cleanupAndClose)
      close()
    }

    const waitForUpgrade = () => {
      this.once('upgrade', cleanupAndClose)
      this.once('upgradeError', cleanupAndClose)
    }

    if (this.readyState === ReadyState.OPENING || this.readyState === ReadyState.OPEN) {
      this.readyState = ReadyState.CLOSING
      if (this.writeBuffer.length) {
        this.once('drain', () => {
          if (this.upgrading) waitForUpgrade()
          else close()
        })
      } else if (this.upgrading) waitForUpgrade()
      else close()
    }

    return this
  }
}

export class ServerError extends Error {
  code
  constructor(message: string, code: any) {
    super(message)
    this.code = code
  }
}

export class ProbeError extends Error {
  transport
  constructor(transport?: string, err?: any) {
    super('probe error' + err ? `: ${err}` : '')
    this.transport = transport
  }
}

export enum ReadyState {
  OPENING = 'opening',
  OPEN = 'open',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

export interface EngineOptions {
  host: string
  hostname: string
  secure: boolean
  port: string
  query: string
  agent: boolean
  upgrade: boolean
  path: string
  forceJSONP: boolean
  jsonp: boolean
  forceBase64: boolean
  enablesXDR: boolean
  timestampParam: any
  timestampRequests: any
  transports: any
  readyState: string
  writeBuffer: never[]
  prevBufferLen: number
  policyPort: any
  rememberUpgrade: any
  binaryType: null
  onlyBinaryUpgrades: any
  perMessageDeflate: any
  pfx: any
  key: any
  passphrase: any
  cert: any
  ca: any
  ciphers: any
  rejectUnauthorized: any
  forceNode: boolean
  extraHeaders: any
  localAddress: any
}
