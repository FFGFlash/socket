let prev: string, seed: number
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'.split('')
const map = Object.fromEntries(alphabet.map((l, i) => [l, i]))

export default function timestamp() {
  const now = encodeTimestamp(Date.now())
  if (now !== prev) return (seed = 0), (prev = now)
  return `${now}.${encodeTimestamp(seed++)}`
}

export function encodeTimestamp(ms: number) {
  let ts = ''
  for (let num = ms, len = alphabet.length; num > 0; num = Math.floor(ms / len)) ts = alphabet[num % len] + ts
  return ts
}

export function decodeTimestamp(str: string) {
  let ts = 0
  for (let i = 0; i < str.length; i++) ts = ts * alphabet.length + map[str.charAt(i)]
  return ts
}

timestamp.decode = decodeTimestamp
timestamp.encode = encodeTimestamp
