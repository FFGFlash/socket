import EventEmitter from 'events'

export default function on(self: EventEmitter, event: string, callback: (...args: any[]) => void) {
  self.on(event, callback)
  return () => {
    self.off(event, callback)
  }
}
