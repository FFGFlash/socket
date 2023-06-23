import JSONPTransport from './polling-jsonp'
import XHRTransport from './polling-xhr'
import WebsocketTransport from './websocket'

const XMLHttpRequest = require('xmlhttprequest-ssl').XMLHttpRequest

export function polling(options: any) {
  let xd = false
  let xs = false
  let jsonp = options.jsonp !== false
  if (global.location) {
    const isSSL = global.location.protocol === 'https:'
    const port = global.location.port || isSSL ? '443' : '80'
    xd = options.hostname !== global.location.hostname || port !== options.port
    xs = options.secure !== isSSL
  }

  options.xdomain = xd
  options.xscheme = xs
  const xhr = new XMLHttpRequest(options)
  if ('open' in xhr && !options.forceJSONP) return new XHRTransport(options)
  else {
    if (!jsonp) throw new Error('JSONP Disabled')
    return new JSONPTransport(options)
  }
}

export function websocket(options: any) {
  return new WebsocketTransport(options)
}

export default {
  polling,
  websocket,
} as const
