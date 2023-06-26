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

export const PacketsList = Object.keys(Packets)

export const ErrorPacket = { type: 'error', data: 'parser error' }

export interface Packet {
  type: keyof typeof Packets
  data?: any
  options?: any
}

export type EncodePacketCallback = (encodedPacket: string | Buffer | ArrayBuffer | Blob) => void

export function setLengthHeader(message: string | Buffer) {
  return `${message.length}:${message}`
}
