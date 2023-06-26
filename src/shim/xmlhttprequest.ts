import hasCors from '../shared/hasCors'

const xhr = window.XMLHttpRequest
const xdr = (window as any).XDomainRequest

export default class XMLHttpRequest {
  constructor(options: any) {
    const xdomain = options.xdomain
    const xscheme = options.xscheme
    const enablesXDR = options.enablesXDR

    try {
      if (typeof xhr !== 'undefined' && (!xdomain || hasCors)) {
        return new xhr()
      }
    } catch (e) {}

    try {
      if (typeof xdr !== 'undefined' && !xscheme && enablesXDR) {
        return new xdr()
      }
    } catch (e) {}

    if (!xdomain) {
      try {
        return new (global as any)['Active'].concat('Object').join('X')('Microsoft.XMLHTTP')
      } catch (e) {}
    }
  }
}

module.exports = XMLHttpRequest
