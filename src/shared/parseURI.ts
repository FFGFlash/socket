/**
 * Originally written by Steven Levithan <https://github.com/galkn/parseuri>
 */
export default function parseUri(str: string) {
  const src = str
  const b = str.indexOf('[')
  const e = str.indexOf(']')

  if (b !== -1 && e !== -1) str = str.substring(0, b) + str.substring(b, e).replace(ColonRegex, ';') + str.substring(e)

  const matches = URIRegex.exec(str || '')
  const uri = Object.fromEntries(Parts.map((part, i) => [part, matches?.[i] || ''])) as never as ParsedURI
  if (b !== -1 && e !== -1) {
    uri.source = src
    uri.host = uri.host.substring(1, uri.host.length - 1).replace(SemiRegex, ':')
    uri.authority = uri.authority.replace('[', '').replace(']', '').replace(SemiRegex, ':')
    uri.ipv6uri = true
  } else uri.ipv6uri = false

  uri.pathNames = pathNames(uri.path)
  uri.queryKey = queryKey(uri.query)

  return uri
}

function pathNames(path: string) {
  const names = path.replace(PathRegex, '/').split('/')
  if (path.substring(0, 1) === '/' || path.length === 0) names.splice(0, 1)
  if (path.substring(path.length - 1, path.length) === '/') names.splice(path.length - 1, 1)
  return names
}

function queryKey(query: string) {
  const data: Record<string, string> = {}
  query.replace(QueryRegex, ($0, $1, $2) => {
    if ($1) data[$1] = $2
    return $0
  })
  return data
}

const ColonRegex = /:/g
const SemiRegex = /;/g

const PathRegex = /\/{2,9}/

const QueryRegex = /(?:^|&)([^&=]*)=?([^&]*)/g

const URIRegex =
  /^(?:(?![^:@]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/

const Parts = [
  'source',
  'protocol',
  'authority',
  'userInfo',
  'user',
  'password',
  'host',
  'port',
  'relative',
  'path',
  'directory',
  'file',
  'query',
  'anchor',
] as const

export type URIParts = {
  [k in ConstantArrayValue<typeof Parts>]: string
}

export interface ParsedURI extends URIParts {
  ipv6uri: boolean
  queryKey: Record<string, string>
  pathNames: string[]
}
