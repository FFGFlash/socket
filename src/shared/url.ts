import parseUri, { ParsedURI } from './parseURI'

export default function url(uri: string | ParsedURI, location = window.location) {
  let obj: any
  if (null == uri) uri = `${location.protocol}//${location.host}`

  if ('string' === typeof uri) {
    if ('/' === uri.charAt(0)) uri = `${'/' === uri.charAt(1) ? location.protocol : location.host}${uri}`
    if (!ProtocolRegex.test(uri)) uri = `${'undefined' !== typeof location ? location.protocol : 'https:'}//${uri}`
    obj = parseUri(uri)
  } else obj = uri

  if (!obj.port) {
    if (SecureProtocolRegex.test(obj.protocol)) obj.port = '443'
    else obj.port = '80'
  }

  obj.path = obj.path || '/'

  const ipv6 = obj.host.indexOf(':') !== -1
  const host = ipv6 ? `[${obj.host}]` : obj.host
  obj.id = `${obj.protocol}://${host}:${obj.port}`
  obj.href = `${obj.protocol}://${host}${location?.port === obj.port ? '' : `:${obj.port}`}`

  return obj as URLObject
}

const ProtocolRegex = /^(https?|wss?):\/\//
const SecureProtocolRegex = /^(http|ws)s:\/\//

export interface URLObject extends ParsedURI {
  id: string
  href: string
}
