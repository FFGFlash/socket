import * as NodeParser from './node'
import * as BrowserParser from './browser'

const isNode = !(global.window as typeof window | undefined)
const Parser = isNode ? NodeParser : BrowserParser

export { Packets, PacketsList, Packet, Protocol } from './shared'

export const encodePacket = Parser.encodePacket
export const encodeBase64Packet = Parser.encodeBase64Packet
export const decodePacket = Parser.decodePacket
export const decodeBase64Packet = Parser.decodeBase64Packet
export const encodePayload = Parser.encodePayload
export const encodePayloadAsBinary = isNode && NodeParser.encodePayloadAsBinary
export const encodePayloadAsBlob = !isNode && BrowserParser.encodePayloadAsBlob
export const decodePayload = Parser.decodePayload
export const decodePayloadAsBinary = Parser.decodePayloadAsBinary
