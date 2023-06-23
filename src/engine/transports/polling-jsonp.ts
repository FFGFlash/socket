import Polling from './polling'

const NewLineRegex = /\n/g
const EscapedNewLineRegex = /\\n/g
let callbacks: any[]

export default class JSONPTransport extends Polling {
  supportsBinary = false
  index: number
  script?: HTMLScriptElement
  form?: HTMLFormElement
  area?: HTMLTextAreaElement
  iframe?: HTMLIFrameElement
  iframeId?: string

  constructor(options?: any) {
    super(options)

    this.query = this.query || {}

    if (!callbacks) {
      if (!global.___eio) global.___eio = []
      callbacks = global.___eio
    }

    this.index = callbacks.length

    callbacks.push((msg: any) => this.onData(msg))
    this.query.j = this.index

    if (global.document && global.addEventListener)
      global.addEventListener('beforeunload', () => this.script && (this.script.onerror = () => {}), false)
  }

  doClose(): void {
    if (this.script) {
      this.script.parentNode?.removeChild(this.script)
      this.script = undefined
    }

    if (this.form) {
      this.form.parentNode?.removeChild(this.form)
      this.form = undefined
      this.iframe = undefined
    }

    super.doClose()
  }

  doPoll(): void {
    const script = document.createElement('script')

    if (this.script) {
      this.script.parentNode?.removeChild(this.script)
      this.script = undefined
    }

    script.async = true
    script.src = this.uri
    script.onerror = e => this.onError('jsonp poll error', e)

    const insertAt = document.getElementsByTagName('script')[0]
    if (insertAt) insertAt.parentNode?.insertBefore(script, insertAt)
    else (document.head || document.body).appendChild(script)

    this.script = script

    const isGecko = typeof navigator !== 'undefined' && /gecko/i.test(navigator.userAgent)
    if (!isGecko) return

    setTimeout(() => {
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      document.body.removeChild(iframe)
    }, 100)
  }

  doWrite(data: string | Buffer, done: () => void): void {
    if (data instanceof Buffer) {
      this.onError('jsonp polling does not support binary.', new Error())
      return
    }

    let iframe: HTMLIFrameElement

    if (!this.form) {
      const form = document.createElement('form')
      const area = document.createElement('textarea')
      const id = (this.iframeId = `eio_iframe_${this.index}`)
      form.className = 'socketio'
      form.style.position = 'absolute'
      form.style.top = '-1000px'
      form.style.left = '-1000px'
      form.target = id
      form.method = 'POST'
      form.setAttribute('accept-charset', 'utf-8')
      area.name = 'd'
      form.appendChild(area)
      document.body.appendChild(form)
      this.form = form
      this.area = area
    }

    this.form.action = this.uri

    const complete = () => {
      initIframe()
      done()
    }

    const initIframe = () => {
      if (this.iframe) {
        try {
          this.form?.removeChild(this.iframe)
        } catch (e) {
          this.onError('jsonp polling iframe removal error', e)
        }
      }

      try {
        const html = `<iframe src="javascript:0" name="${this.iframeId}">`
        iframe = document.createElement(html) as HTMLIFrameElement
      } catch (e) {
        iframe = document.createElement('iframe')
        iframe.name = this.iframeId!
        iframe.src = 'javascript:0'
      }

      iframe.id = this.iframeId!
      this.form?.appendChild(iframe)
      this.iframe = iframe
    }

    initIframe()

    data = data.replace(EscapedNewLineRegex, '\\\n')
    this.area!.value = data.replace(NewLineRegex, '\\n')

    try {
      this.form.submit()
    } catch (e) {}

    if ('attachEvent' in this.iframe! && 'onreadystatechange' in this.iframe!) {
      this.iframe!.onreadystatechange = () => {
        if ('readyState' in this.iframe! && this.iframe!.readyState !== 'complete') return
        complete()
      }
    } else {
      this.iframe!.onload = complete
    }
  }
}
