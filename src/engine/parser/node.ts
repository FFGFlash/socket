import wtf8 from 'wtf-8'
import { Packets, PacketsList, ErrorPacket, Packet, EncodePacketCallback, setLengthHeader } from './shared'

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

export function decodePacket(data: string | ArrayBuffer | Buffer, binaryType: any, utf8decode?: boolean) {
  if (data === undefined) return ErrorPacket
  if (typeof data === 'string') {
    if (data.charAt(0) === 'b') return decodeBase64Packet(data.substring(1), binaryType)
    let type = data.charAt(0)
    if (utf8decode) {
      try {
        data = wtf8.decode(data) as string
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
  const type = PacketsList[Number((data as Buffer)[0])]
  return { type, data: (data as Buffer).subarray(1) }
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
    encodePacket(packet, supportsBinary as boolean, true, message => (results[i] = setLengthHeader(message as string | Buffer)))
  })
  callback(results.join(''))
}

export function encodePayloadAsBinary(packets: Packet[], callback: EncodePacketCallback) {
  if (!packets.length) return callback(Buffer.alloc(0))
  const results: Buffer[] = []
  packets.forEach((packet, i) => {
    encodePacket(packet, true, true, packet => {
      const isBinary = typeof packet !== 'string'
      const encodingLen = String((packet as Buffer).length)
      const sizeBuffer = Buffer.alloc(encodingLen.length + 2)
      sizeBuffer[0] = +isBinary
      for (let i = 0; i < encodingLen.length; i++) sizeBuffer[i + 1] = parseInt(encodingLen[i], 10)
      sizeBuffer[sizeBuffer.length - 1] = 255
      results[i] = Buffer.concat([sizeBuffer, isBinary ? (packet as Buffer) : stringToBuffer(packet)])
    })
  })
  callback(Buffer.concat(results))
}

export function decodePayload(data: string | Buffer, binaryType?: any, callback: any = () => {}) {
  if (typeof data !== 'string') return decodePayloadAsBinary(data, binaryType, callback)
  if (typeof binaryType === 'function') {
    callback = binaryType
    binaryType = undefined
  }

  let packet
  if (data === '') return callback(ErrorPacket, 0, 1)

  let length = ''
  let n: number, msg: string
  for (let i = 0, l = data.length; i < l; i++) {
    const char = data.charAt(i)
    if (char !== ':') {
      length += char
      continue
    }

    if (length === '' || isNaN((n = Number(length)))) return callback(ErrorPacket, 0, 1)

    const s = i + 1
    msg = data.substring(s, s + n)

    if (n !== msg.length) return callback(ErrorPacket, 0, 1)

    if (msg.length) {
      packet = decodePacket(msg, binaryType, true)
      if (ErrorPacket.type === packet.type && 'data' in packet && ErrorPacket.data === packet.data) return callback(ErrorPacket, 0, 1)
      const ret = callback(packet, i + n, l)
      if (ret === false) return
    }

    i += n
    length = ''
  }

  if (length !== '') return callback(ErrorPacket, 0, 1)
}

export function decodePayloadAsBinary(data: Buffer, binaryType: any, callback: any = () => undefined) {
  if (typeof binaryType === 'function') {
    callback = binaryType
    binaryType = null
  }

  let bufferTail = data
  const buffers: (string | Buffer)[] = []

  while (bufferTail.length > 0) {
    let strLen = ''
    let numTooLong = false
    const isString = bufferTail[0] === 0
    let i = 0
    while (++i) {
      if (bufferTail[i] === 255) break
      if (strLen.length > 310) {
        numTooLong = true
        break
      }
      strLen += '' + bufferTail[i]
    }

    if (numTooLong) return callback(ErrorPacket, 0, 1)

    bufferTail = bufferTail.subarray(strLen.length + 1)

    const msgLen = parseInt(strLen, 10)
    let msg: string | Buffer = bufferTail.subarray(1, msgLen + 1)
    if (isString) msg = bufferToString(msg)
    buffers.push(msg)
    bufferTail = bufferTail.subarray(msgLen + 1)
  }

  const total = buffers.length
  buffers.forEach((buffer, i) => callback(decodePacket(buffer, binaryType, true), i, total))
}

function bufferToString(buf: Buffer) {
  let str = ''
  for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i])
  return str
}

function stringToBuffer(str: string) {
  const buffer = Buffer.alloc(str.length)
  for (let i = 0; i < str.length; i++) buffer.writeUInt8(str.charCodeAt(i), i)
  return buffer
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
