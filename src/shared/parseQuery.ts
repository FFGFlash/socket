export function decodeQuery(string: string) {
  if (!string) return {}
  return Object.fromEntries(string.split('&').map(q => q.split('=').map(p => decodeURIComponent(p))))
}

export function encodeQuery(query: Object) {
  if (!query) return ''
  return Object.entries(query)
    .map(q => `${encodeURIComponent(q[0])}=${encodeURIComponent(q[1])}`)
    .join('&')
}
