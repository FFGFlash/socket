import debug from 'debug'
import EventEmitter from 'eventemitter3'
import { isBuffer } from '../shared/natives'
import { deconstructPacket, reconstructPacket, removeBlobs } from './binary'

const info = debug('socket-client:parser')

export interface Packet {
  type: Types
  data?: any
  id?: number
  nsp?: string
  attachments?: number
  options?: any
  query?: string
}

export type EncoderCallback = (data: any) => void

export enum Types {
  CONNECT = 0,
  DISCONNECT,
  EVENT,
  ACK,
  ERROR,
  BINARY_EVENT,
  BINARY_ACK,
}

export const TYPES = ['CONNECT', 'DISCONNECT', 'EVENT', 'ACK', 'ERROR', 'BINARY_EVENT', 'BINARY_ACK'] as const

export const ERROR_PACKET = `${Types.ERROR}"encode error"`

export class Encoder {
  async encode(obj: any) {
    info('encoding packet %j', obj)
    switch (obj.type) {
      case Types.BINARY_EVENT:
      case Types.BINARY_ACK:
        return await encodeAsBinary(obj)
      default:
        return [encodeAsString(obj)]
    }
  }
}

export class Decoder extends EventEmitter {
  reconstructor?: BinaryReconstructor

  constructor() {
    super()
  }

  add(data: any) {
    if (typeof data === 'string') {
      if (this.reconstructor) throw new Error('Got plaintext data when reconstructing a packet')
      const packet = decodeString(data)
      switch (packet.type) {
        case Types.BINARY_EVENT:
        case Types.BINARY_ACK:
          this.reconstructor = new BinaryReconstructor(packet)
          if (this.reconstructor.packet?.attachments === 0) this.emit('decoded', packet)
          return
        default:
          this.emit('decoded', packet)
          return
      }
    }

    if (isBuffer(data) || data.base64) {
      if (!this.reconstructor) throw new Error('Got binary data when not reconstructing a packet')
      const packet = this.reconstructor.takeBinaryData(data)
      if (!packet) return
      delete this.reconstructor
      this.emit('decoded', packet)
    }

    throw new Error('Unknown type: ' + data)
  }

  destroy() {
    if (!this.reconstructor) return
    this.reconstructor.finishedReconstruction()
  }
}

class BinaryReconstructor {
  packet: Packet | null
  buffers: any[] = []

  constructor(packet: Packet) {
    this.packet = packet
  }

  takeBinaryData(data: any) {
    if (!this.packet) return null
    this.buffers.push(data)
    if (this.buffers.length === this.packet.attachments) {
      const packet = reconstructPacket(this.packet, this.buffers)
      this.finishedReconstruction()
      return packet
    }
    return null
  }

  finishedReconstruction() {
    this.packet = null
    this.buffers = []
  }
}

function encodeAsString(obj: any) {
  //* We start with our type
  let str = obj.type.toString()

  //* Then if we have attachments, followed by a '-'
  if (Types.BINARY_EVENT === obj.type || Types.BINARY_ACK === obj.type) {
    str += `${obj.attachments}-`
  }

  //* Next if we have a namespace other than '/', followed by a ','
  if (obj.nsp && '/' !== obj.nsp) {
    str += `${obj.nsp},`
  }

  //* Immediately followed by the id
  if (obj.id != null) {
    str += obj.id
  }

  //* Finally our json data
  if (obj.data != null) {
    try {
      const payload = JSON.stringify(obj.data)
      str += payload
    } catch (err) {
      return ERROR_PACKET
    }
  }

  info('encoded %j as %s', obj, str)
  return str
}

async function encodeAsBinary(obj: any) {
  const data = await removeBlobs(obj)
  const deconstruction = deconstructPacket(data)
  const pack = encodeAsString(deconstruction.packet)
  const buffers = deconstruction.buffers

  buffers.unshift(pack)

  return buffers
}

function decodeString(data: string) {
  let i = 0
  const packet: any = {
    type: Number(data.charAt(0)),
    nsp: '/',
  }

  if (null === TYPES[packet.type]) return error(`Unknown packet type: ${packet.type}`)

  if (Types.BINARY_EVENT === packet.type || Types.BINARY_ACK === packet.type) {
    const start = i + 1
    while (data.charAt(++i) !== '-' && i !== data.length) {}
    const buffer = data.substring(start, i)
    if (isNaN(Number(data)) || data.charAt(i) !== '-') throw new Error('Illegal attachments')
    packet.attachments = Number(buffer)
  }

  if ('/' === data.charAt(i + 1)) {
    const start = i + 1
    while (data.charAt(++i) !== ',' && i !== data.length) {}
    packet.nsp = data.substring(start, i)
  }

  let next = data.charAt(i + 1)
  if ('' !== next && !isNaN(Number(next))) {
    const start = i + 1
    while ((next = data.charAt(i + 1)) !== null && !isNaN(Number(next)) && ++i !== data.length) {}
    packet.id = Number(data.substring(start, i + 1))
  }

  if (data.charAt(++i)) {
    try {
      const payload = JSON.parse(data.substring(i))
      if (packet.type === Types.ERROR || Array.isArray(payload)) {
        packet.data = payload
      }
    } catch (err) {
      return error('Invalid payload')
    }
  }

  info('decoded %s as %j', data, packet)
  return packet as Packet
}

function error(message: string): Packet {
  return { type: Types.ERROR, data: `parser error: ${message}` }
}

export default {
  Encoder,
  Decoder,
}
