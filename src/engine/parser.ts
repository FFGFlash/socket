import wtf8 from 'wtf-8'

export const Protocol = 3

export enum Packets {
  /** non-ws */
  open = 0,
  /** non-ws */
  close,
  ping,
  pong,
  message,
  upgrade,
  noop,
}

const PacketsList = Object.keys(Packets)

const ErrorPacket = { type: 'error', data: 'parser error' }

type EncodePacketCallback = (encodedPacket: string | Buffer) => void

export function encodePacket(packet: Packet, callback: EncodePacketCallback): void
export function encodePacket(packet: Packet, supportsBinary: boolean, callback: EncodePacketCallback): void
export function encodePacket(packet: Packet, supportsBinary: boolean, utf8encode: boolean, callback: EncodePacketCallback): void
export function encodePacket(
  packet: Packet,
  supportsBinary: boolean | EncodePacketCallback = false,
  utf8encode: boolean | EncodePacketCallback = false,
  callback: EncodePacketCallback = () => undefined
) {
  if (typeof supportsBinary === 'function') {
    callback = supportsBinary
    supportsBinary = false
  }

  if (typeof utf8encode === 'function') {
    callback = utf8encode
    utf8encode = false
  }

  if (Buffer.isBuffer(packet.data)) return encodeBuffer(packet, supportsBinary, callback)
  if (packet.data && (packet.data.buffer || packet.data) instanceof ArrayBuffer) {
    packet.data = arrayBufferToBuffer(packet.data)
    return encodeBuffer(packet, supportsBinary, callback)
  }

  let encoded = Packets[packet.type]
  if (packet.data !== undefined) encoded += utf8encode ? wtf8.encode(String(packet.data)) : String(packet.data)
  return callback(String(encoded))
}

function encodeBuffer(packet: Packet, supportsBinary: boolean | undefined, callback: EncodePacketCallback) {
  const { data } = packet
  if (!supportsBinary) return encodeBase64Packet(packet, callback)
  const typeBuffer = Buffer.alloc(1)
  typeBuffer[0] = Packets[packet.type]
  return callback(Buffer.concat([typeBuffer, data]))
}

export function encodeBase64Packet(packet: Packet, callback: EncodePacketCallback) {
  if (!Buffer.isBuffer(packet.data)) packet.data = arrayBufferToBuffer(packet.data)
  let message = 'b' + Packets[packet.type]
  message += packet.data.toString('base64')
  return callback(message)
}

export function decodePacket(data: any, binaryType: any, utf8decode: boolean) {
  if (data === undefined) return ErrorPacket
  if (typeof data === 'string') {
    if (data.charAt(0) === 'b') return decodeBase64Packet(data.substring(1), binaryType)
    let type = data.charAt(0)
    if (utf8decode) {
      try {
        data = wtf8.decode(data)
      } catch (e) {
        return ErrorPacket
      }
    }
    if (isNaN(Number(type)) || !(type = PacketsList[Number(type)])) return ErrorPacket
    if (data.length > 1) return { type, data: data.substring(1) }
    return { type }
  }

  if (binaryType === 'arrayBuffer') {
    const intArray = new Uint8Array(data)
    const type = PacketsList[Number(intArray[0])]
    return { type, data: intArray.buffer.slice(1) }
  }

  if (data instanceof ArrayBuffer) data = arrayBufferToBuffer(data)
  const type = PacketsList[Number(data[0])]
  return { type, data: data.slice(1) }
}

export function decodeBase64Packet(message: string, binaryType: any) {
  const type = PacketsList[Number(message.charAt(0))]
  const data = Buffer.from(message.substring(1), 'base64')
  if (binaryType === 'arrayBuffer') {
    const abv = new Uint8Array(data.length)
    for (let i = 0; i < abv.length; i++) abv[i] = data[i]
    return { type, data: abv.buffer }
  }
  return { type, data }
}

export function encodePayload(
  packets: Packet[],
  supportsBinary: boolean | EncodePacketCallback = false,
  callback: EncodePacketCallback = () => undefined
) {
  if (typeof supportsBinary === 'function') {
    callback = supportsBinary
    supportsBinary = false
  }

  if (supportsBinary) return encodePayloadAsBinary(packets, callback)

  if (!packets.length) return callback('0:')

  const results: string[] = []
  packets.forEach((packet, i) => {
    encodePacket(packet, supportsBinary as boolean, true, message => (results[i] = setLengthHeader(message)))
  })
  callback(results.join(''))
}

export function encodePayloadAsBinary(packets: Packet[], callback: EncodePacketCallback) {
  if (!packets.length) return callback(Buffer.alloc(0))
  const results: Buffer[] = []
  packets.forEach((packet, i) => {
    encodePacket(packet, true, true, packet => {
      const isBinary = typeof packet !== 'string'
      const encodingLen = String(packet.length)
      const sizeBuffer = Buffer.alloc(encodingLen.length + 2)
      sizeBuffer[0] = +isBinary
      for (let i = 0; i < encodingLen.length; i++) sizeBuffer[i + 1] = parseInt(encodingLen[i], 10)
      sizeBuffer[sizeBuffer.length - 1] = 255
      results[i] = Buffer.concat([sizeBuffer, isBinary ? packet : stringToBuffer(packet)])
    })
  })
  callback(Buffer.concat(results))
}

export function decodePayload(data: any, binaryType: any, callback: any) {}

function stringToBuffer(str: string) {
  const buffer = Buffer.alloc(str.length)
  for (let i = 0; i < str.length; i++) buffer.writeUInt8(str.charCodeAt(i), i)
  return buffer
}

function setLengthHeader(message: string | Buffer) {
  return `${message.length}:${message}`
}

function arrayBufferToBuffer(data: any) {
  const array = new Uint8Array(data.buffer || data)
  const length = data.byteLength || data.length
  const offset = data.byteOffset || 0
  const buffer = Buffer.alloc(length)
  for (var i = 0; i < length; i++) {
    buffer[i] = array[offset + i]
  }
  return buffer
}

export interface Packet {
  type: keyof typeof Packets
  data: any
}
