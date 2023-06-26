let hasCors = false
try {
  hasCors = typeof XMLHttpRequest !== 'undefined' && 'withCredentials' in new XMLHttpRequest()
} catch (e) {}
export default hasCors
