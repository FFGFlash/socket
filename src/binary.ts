import { Packet } from './parser'

export interface BufferPlaceholder {
  _placeholder: true
  num: number
}

export function deconstructPacket(packet: Packet): { packet: Packet; buffers: any[] } {
  const buffers: any[] = []
  const data = _deconstructPacket(packet.data, buffers)
  return {
    packet: {
      ...packet,
      data,
      attachments: buffers.length,
    },
    buffers,
  }
}

function _deconstructPacket(data: Packet['data'], buffers: any[]): Packet['data'] {
  if (!data) return data
  if (Buffer.isBuffer(data)) {
    const placeholder: BufferPlaceholder = { _placeholder: true, num: buffers.length }
    buffers.push(data)
    return placeholder
  }
  if (Array.isArray(data)) return data.map(d => _deconstructPacket(d, buffers))
  if (typeof data === 'object' && !(data instanceof Date))
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, _deconstructPacket(value, buffers)]))
  return data
}

export function reconstructPacket(packet: Packet, buffers: any[]): Packet {
  return {
    ...packet,
    data: _reconstructPacket(packet.data, buffers),
    attachment: undefined,
  } as any
}

function _reconstructPacket(data: Packet['data'], buffers: any[]): Packet['data'] {
  if (!data) return data
  if (data && data._placeholder === true) {
    const isIndexValid = typeof data.num === 'number' && data.num >= 0 && data.num < buffers.length
    if (isIndexValid) return buffers[data.num]
    throw new Error('Illegal attachments')
  }
  if (Array.isArray(data)) return data.map(d => _reconstructPacket(d, buffers))
  if (typeof data === 'object') return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, _reconstructPacket(value, buffers)]))
  return data
}

export function removeBlobs(data: any) {
  return new Promise<any>(resolve => {
    let pendingBlobs = 0
    let result = data
    const removeBlobs = (data: any, key?: string | number, parent?: any) => {
      if (!data) return data

      if (data instanceof Blob || data instanceof File) {
        pendingBlobs++
        const fileReader = new FileReader()

        fileReader.onload = function () {
          if (parent) parent[key!] = this.result
          else result = this.result
          if (!--pendingBlobs) resolve(result)
        }

        fileReader.readAsArrayBuffer(data)
      } else if (Array.isArray(data)) {
        data.forEach((value, index) => removeBlobs(value, index, data))
      } else if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        Object.entries(data).map(([key, value]) => removeBlobs(value, key, data))
      }
    }
    removeBlobs(result)
    if (!pendingBlobs) resolve(result)
  })
}
