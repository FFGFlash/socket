export interface BackOffOptions {
  min: number
  max: number
  jitter: number
  factor: number
}

export default class BackOff {
  options: BackOffOptions
  ms: number
  max: number
  factor: number
  jitter: number
  attempts = 0

  constructor(options?: Partial<BackOffOptions>) {
    options = this.options = Object.assign(
      {
        min: 100,
        max: 10000,
        jitter: 0,
        factor: 2,
      },
      options || {}
    )
    this.ms = this.options.min
    this.max = this.options.max
    this.factor = this.options.factor
    this.jitter = Math.min(Math.max(0, this.options.jitter), 1)
  }

  get duration() {
    let ms = this.ms * Math.pow(this.factor, this.attempts++)
    if (this.jitter) {
      const random = Math.random()
      const deviation = Math.floor(random * this.jitter * ms)
      ms = (Math.floor(random * 10) & 1) == 0 ? ms - deviation : ms + deviation
    }
    return Math.min(ms, this.max) | 0
  }

  reset() {
    this.attempts = 0
  }

  setMin(value: number) {
    this.ms = value
  }

  setMax(value: number) {
    this.max = value
  }

  setJitter(value: number) {
    this.jitter = value
  }
}
