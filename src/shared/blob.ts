const g = global as any
const gBlobBuilder = g.BlobBuilder || g.WebKitBlobBuilder || g.MSBlobBuilder || g.MozBlobBuilder

export const isBlobSupported = (() => {
  try {
    return new global.Blob(['hi']).size === 2
  } catch (e) {
    return false
  }
})()

export const isArrayBufferViewSupportedByBlob =
  isBlobSupported &&
  (() => {
    try {
      return new global.Blob([new Uint8Array([1, 2])]).size === 2
    } catch (e) {
      return false
    }
  })()

export const isBlobBuilderSupported = gBlobBuilder && gBlobBuilder.prototype.append && gBlobBuilder.prototype.getBlob

function mapArrayBufferViews(blobParts?: BlobPart[]) {
  if (!blobParts) return
  for (var i = 0; i < blobParts.length; i++) {
    var chunk = blobParts[i]
    if (typeof chunk !== 'string' && 'buffer' in chunk && chunk.buffer instanceof ArrayBuffer) {
      var buf = chunk.buffer

      // if this is a subarray, make a copy so we only
      // include the subarray region from the underlying buffer
      if (chunk.byteLength !== buf.byteLength) {
        var copy = new Uint8Array(chunk.byteLength)
        copy.set(new Uint8Array(buf, chunk.byteOffset, chunk.byteLength))
        buf = copy.buffer
      }

      blobParts[i] = buf
    }
  }
}

class Blob {
  constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
    mapArrayBufferViews(blobParts)
    return new Blob(blobParts, options)
  }
}

class BlobBuilder {
  constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
    options = options || {}
    const bb = new gBlobBuilder()
    mapArrayBufferViews(blobParts)
    blobParts?.forEach(part => bb.append(part))
    return options.type ? bb.getBlob(options.type) : bb.getBlob()
  }
}

export default (() => {
  if (isBlobSupported) return isArrayBufferViewSupportedByBlob ? global.Blob : Blob
  if (isBlobBuilderSupported) return BlobBuilder
  return undefined
})()
