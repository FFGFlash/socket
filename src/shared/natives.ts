const toString = Object.prototype.toString

export const withNativeBuffer = typeof Buffer === 'function' && typeof Buffer.isBuffer === 'function'
export const withNativeBlob = typeof Blob === 'function' || (typeof Blob !== 'undefined' && toString.call(Blob) === '[object BlobConstructor]')
export const withNativeFile = typeof File === 'function' || (typeof File !== 'undefined' && toString.call(File) === '[object FileConstructor]')
export const withNativeArrayBuffer = typeof ArrayBuffer === 'function'
export const withNativeIsArray = typeof Array.isArray === 'function'
export const withNativeIndexOf = typeof Array.prototype.indexOf === 'function'

export const isView = (arg: any): arg is ArrayBufferView =>
  typeof ArrayBuffer.isView === 'function' ? ArrayBuffer.isView(arg) : arg.buffer instanceof ArrayBuffer
export const isBuffer = (arg: any) =>
  (withNativeBuffer && Buffer.isBuffer(arg)) || (withNativeArrayBuffer && arg instanceof ArrayBuffer) || isView(arg)
export const isArray = withNativeIsArray ? Array.isArray : (arg: any): arg is any[] => toString.call(arg) === '[object Array]'
export const indexOf = (arr: any[], obj: any) => {
  if (withNativeIndexOf) return arr.indexOf(obj)
  for (let i = 0; i < arr.length; i++) if (arr[i] === obj) return i
  return -1
}
