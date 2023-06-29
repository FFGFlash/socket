import debug from 'debug'
import Manager, { ManagerOptions } from './manager/manager'
import url from './shared/url'

const info = debug('socket-client')

export const cache: Record<string, Manager> = {}

export default function io(uri?: Partial<LookupOptions> | string, options: Partial<LookupOptions> = {}) {
  if (uri && typeof uri === 'object') {
    options = uri
    uri = undefined
  }
  const parsed = url(uri || '')
  const { source, id, path, query } = parsed
  const sameNamespace = cache[id] && path in cache[id].nsps
  const newConnection = options.forceNew || options['force new connection'] || false === options.multiplex || sameNamespace

  let io: Manager

  if (newConnection) {
    info('ignoring socket cache for %s', source)
    io = new Manager(source, options)
  } else {
    if (!cache[id]) info('new io instance for %s', source)
    io = cache[id] = cache[id] || new Manager(source, options)
  }

  options.query ??= query

  if (typeof options.query === 'object') options.query = encodeQueryString(options.query)
  return io.socket(path, options as any)
}

function encodeQueryString(obj: Record<string, string>) {
  const str = []
  for (let p in obj) {
    if (!obj.hasOwnProperty(p)) continue
    str.push(`${encodeURIComponent(p)}=${encodeURIComponent(obj[p])}`)
  }
  return str.join('&')
}

export interface LookupOptions extends ManagerOptions {
  forceNew: boolean
  ['force new connection']: boolean
  multiplex: boolean
  query: string | Record<string, string>
}

export { io as connect, cache as managers }
export { default as Manager } from './manager/manager'
export { default as Socket } from './socket/socket'
export { default as EngineSocket } from './engine/engine'
export { default as Parser } from './parser/parser'
