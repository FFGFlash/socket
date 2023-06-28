import wtf8 from 'wtf-8'
import { isAndroid, isPhantom, withNativeArrayBuffer, withNativeBlob } from '../../shared/natives'
import { Packets, PacketsList, ErrorPacket, Packet, EncodePacketCallback, setLengthHeader } from './shared'
import Blob from '../../shared/blob'
import hasBinary from '../../socket/hasBinary'

let base64Encoder: any
if (global && global.ArrayBuffer) {
  base64Encoder = require('base64-arraybuffer')
}

const noBlobs = isAndroid || isPhantom

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

  const data = packet.data === undefined ? undefined : packet.data.buffer || packet.data

  if (withNativeArrayBuffer && data instanceof ArrayBuffer) return encodeArrayBuffer(packet, supportsBinary, callback)
  if (Blob && data instanceof global.Blob) return encodeBlob(packet, supportsBinary, callback)
  if (data && data.base64) return encodeBase64Object(packet, callback)
  let encoded = Packets[packet.type]
  if (packet.data !== undefined) encoded += utf8encode ? wtf8.encode(String(packet.data)) : String(packet.data)
  return callback(String(encoded))
}

function encodeBase64Object(packet: Packet, callback: EncodePacketCallback) {
  const message = 'b' + Packets[packet.type] + packet.data.data
  return callback(message)
}

function encodeArrayBuffer(packet: Packet, supportsBinary: boolean, callback: EncodePacketCallback) {
  if (!supportsBinary) return encodeBase64Packet(packet, callback)
  const data = packet.data
  const contentArray = new Uint8Array(data)
  const resultBuffer = new Uint8Array(1 + data.byteLength)
  resultBuffer[0] = Packets[packet.type]
  for (let i = 0; i < contentArray.length; i++) resultBuffer[i + 1] = contentArray[i]
  return callback(resultBuffer.buffer)
}

function encodeBlobAsArrayBuffer(packet: Packet, supportsBinary: boolean, callback: EncodePacketCallback) {
  if (!supportsBinary) return encodeBase64Packet(packet, callback)
  const fr = new FileReader()
  fr.onload = () => {
    packet.data = fr.result
    encodePacket(packet, supportsBinary, true, callback)
  }
  return fr.readAsArrayBuffer(packet.data)
}

function encodeBlob(packet: Packet, supportsBinary: boolean, callback: EncodePacketCallback) {
  if (!supportsBinary) encodeBase64Packet(packet, callback)
  if (noBlobs) return encodeBlobAsArrayBuffer(packet, supportsBinary, callback)
  const length = new Uint8Array(1)
  length[0] = Packets[packet.type]
  const blob = new Blob!([length.buffer, packet.data]) as string & Blob
  return callback(blob)
}

export function encodeBase64Packet(packet: Packet, callback: EncodePacketCallback) {
  const message = 'b' + Packets[packet.type]
  if (Blob && packet.data instanceof global.Blob) {
    const fr = new FileReader()
    fr.onload = () => {
      const b64 = (fr.result as string)?.split(',')[1]
      callback(message + b64)
    }
    return fr.readAsDataURL(packet.data)
  }

  let b64Data
  try {
    b64Data = String.fromCharCode.apply(null, new Uint8Array(packet.data) as never as number[])
  } catch (e) {
    const typed = new Uint8Array(packet.data)
    const basic = new Array(typed.length)
    for (let i = 0; i < typed.length; i++) basic[i] = typed[i]
    b64Data = String.fromCharCode.apply(null, basic)
  }
  return callback(message + btoa(b64Data))
}

export function decodePacket(data: any, binaryType: string, utf8decode?: boolean) {
  if (data === undefined) return ErrorPacket
  if (typeof data === 'string') {
    if (data.charAt(0) === 'b') return decodeBase64Packet(data.substring(1), binaryType)
    if (utf8decode) {
      try {
        data = wtf8.decode(data)
      } catch (e) {
        return ErrorPacket
      }
    }

    const type = Number(data.charAt(0))
    if (isNaN(type) || !PacketsList[type]) return ErrorPacket
    if (data.length > 1) return { type: PacketsList[type], data: data.substring(1) }
    return { type: PacketsList[type] }
  }

  const asArray = new Uint8Array(data)
  const type = asArray[0]
  let rest: any = asArray.slice(1)
  if (Blob && binaryType === 'blob') rest = new Blob([rest])
  return { type: PacketsList[type], data: rest }
}

export function decodeBase64Packet(message: string, binaryType: string) {
  const type = PacketsList[Number(message.charAt(0))]
  if (!base64Encoder) return { type, data: { base64: false, data: message.substring(1) } }
  let data = base64Encoder.decode(message.substring(1))
  if (binaryType === 'blob' && Blob) data = new Blob([data])
  return { type, data }
}

export function encodePayload(packets: Packet[], supportsBinary: boolean | EncodePacketCallback = false, callback: EncodePacketCallback = () => {}) {
  if (typeof supportsBinary === 'function') {
    callback = supportsBinary
    supportsBinary = false
  }

  const isBinary = hasBinary(packets)

  if (supportsBinary && isBinary) {
    if (Blob && !noBlobs) return encodePayloadAsBlob(packets, callback)
    return encodePayloadAsArrayBuffer(packets, callback)
  }
  if (!packets.length) return callback('0:')

  const results: string[] = []
  packets.forEach((packet, i) => {
    encodePacket(packet, supportsBinary as boolean, true, message => (results[i] = setLengthHeader(message as string | Buffer)))
  })
  callback(results.join(''))
}

export function decodePayload(data: any, binaryType?: any, callback: any = () => {}) {
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

export function encodePayloadAsArrayBuffer(packets: Packet[], callback: any = () => {}) {
  if (!packets.length) return callback(new ArrayBuffer(0))

  const encodedPackets: (string | Buffer | ArrayBuffer)[] = []
  packets.forEach((packet, i) => {
    encodePacket(packet, true, true, data => (encodedPackets[i] = data as any))
  })

  const totalLength = encodedPackets.reduce((total, packet) => {
    const len = typeof packet === 'string' ? packet.length : packet.byteLength
    return total + len.toString().length + len + 2
  }, 0)

  const resultArray = new Uint8Array(totalLength)
  let bufferIndex = 0

  encodedPackets.forEach(packet => {
    const isString = typeof packet === 'string'
    let ab = packet
    if (isString) {
      const view = new Uint8Array(packet.length)
      for (let i = 0; i < packet.length; i++) view[i] = packet.charCodeAt(i)
      ab = view.buffer
    }

    resultArray[bufferIndex++] = +!isString

    const lenStr = (ab as ArrayBuffer | Buffer).byteLength.toString()
    for (let i = 0; i < lenStr.length; i++) resultArray[bufferIndex++] = parseInt(lenStr[i])
    resultArray[bufferIndex++] = 255

    const view = new Uint8Array(ab as ArrayBuffer | Buffer)
    for (let i = 0; i < view.length; i++) {
      resultArray[bufferIndex++] = view[i]
    }
  })

  return callback(resultArray.buffer)
}

export function encodePayloadAsBlob(packets: Packet[], callback: any = () => {}) {
  const results: any[] = []

  packets.forEach((packet, i) => {
    encodePacket(packet, true, true, (encoded: any) => {
      const binaryIdentifier = new Uint8Array(1)
      binaryIdentifier[0] = 1
      if (typeof encoded === 'string') {
        const view = new Uint8Array(encoded.length)
        for (let i = 0; i < encoded.length; i++) view[i] = encoded.charCodeAt(i)
        encoded = view.buffer
        binaryIdentifier[0] = 0
      }
      const len = encoded instanceof ArrayBuffer ? encoded.byteLength : encoded.size
      const lenStr = len.toString()
      const lenArray = new Uint8Array(lenStr.length + 1)
      for (let i = 0; i < lenStr.length; i++) lenArray[i] = parseInt(lenStr[i])
      lenArray[lenStr.length] = 255

      if (Blob) results[i] = new Blob([binaryIdentifier.buffer, lenArray.buffer, encoded])
    })
  })

  if (results.length) callback(new Blob!(results))
}

export function decodePayloadAsBinary(data: ArrayBuffer, binaryType: any, callback: any = () => {}) {
  if (typeof binaryType === 'function') {
    callback = binaryType
    binaryType = undefined
  }

  let bufferTail = data
  const buffers: string[] = []

  while (bufferTail.byteLength > 0) {
    const tailArray = new Uint8Array(bufferTail)
    const isString = tailArray[0] === 0
    let msgLength: string | number = ''
    let i = 0
    while (++i) {
      if (tailArray[i] === 255) break
      if (msgLength.length > 310) {
        return callback(ErrorPacket, 0, 1)
      }
      msgLength += tailArray[i]
    }

    bufferTail = bufferTail.slice(msgLength.length + 2)
    msgLength = parseInt(msgLength)

    let msg: ArrayBuffer | string = bufferTail.slice(0, msgLength)
    if (isString) {
      try {
        msg = String.fromCharCode.apply(null, new Uint8Array(msg) as never as number[])
      } catch (e) {
        const typed = new Uint8Array(msg as ArrayBuffer)
        msg = ''
        for (let i = 0; i < typed.length; i++) msg += String.fromCharCode(typed[i])
      }
    }

    buffers.push(msg as string)
    bufferTail = bufferTail.slice(msgLength)
  }

  const total = buffers.length
  buffers.forEach((buffer, i) => callback(decodePacket(buffer, binaryType, true), i, total))
}
