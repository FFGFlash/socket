import Manager, { ManagerOptions } from './manager/manager'
import url from './shared/url'

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

  if (newConnection) io = new Manager(source, options)
  else io = cache[id] = cache[id] || new Manager(source, options)

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

interface LookupOptions extends ManagerOptions {
  forceNew: boolean
  ['force new connection']: boolean
  multiplex: boolean
  query: string | Record<string, string>
}

export { io as connect, cache as managers }
export { default as Manager } from './manager/manager'
export { default as Socket } from './socket/socket'
