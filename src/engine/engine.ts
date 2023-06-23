import EventEmitter from 'events'
import { decodeQuery } from 'src/shared/parseQuery'
import parseUri from 'src/shared/parseURI'
import { Protocol } from './parser'
import transports from './transports'

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
  id?: number
  upgrades?: any
  pingInterval?: any
  pingTimeout?: any
  pingIntervalTimer?: any
  pingTimeoutTimer?: any

  static priorWebsocketSuccess = false
  static protocol = Protocol

  constructor(uri?: Partial<EngineOptions> | string, options?: Partial<EngineOptions>) {
    super()
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

    this.secure = options.secure != null ? options.secure : global.location && 'https:' === global.location.protocol
    if (options.hostname && !options.port) options.port = this.secure ? '443' : '80'

    this.agent = options.agent || false
    this.hostname = options.hostname || global.location?.hostname || 'localhost'
    this.port = options.port || global.location?.port || this.secure ? '443' : '80'
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
    throw new Error('Method not implemented.')
  }
}

interface EngineOptions {
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
