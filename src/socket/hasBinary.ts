import { isArray, isView, withNativeArrayBuffer, withNativeBlob, withNativeFile } from '../shared/natives'

export default function hasBinary(obj: any, ...args: any[]): boolean {
  if (!obj || typeof obj !== 'object') return false
  if (isArray(obj)) return obj.some(obj => hasBinary(obj))
  if (
    (withNativeArrayBuffer && (obj instanceof ArrayBuffer || isView(obj))) ||
    (withNativeBlob && obj instanceof Blob) ||
    (withNativeFile && obj instanceof File)
  )
    return true
  if (obj.toJSON && typeof obj.toJSON === 'function' && args.length === 0) return hasBinary(obj.toJSON(), true)
  return Object.entries(obj).some(([key, value]) => Object.prototype.hasOwnProperty.call(obj, key) && hasBinary(value))
}
