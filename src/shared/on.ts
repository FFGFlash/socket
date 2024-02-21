import EventEmitter from 'eventemitter3'

export default function on(self: EventEmitter, event: string, callback: (...args: any[]) => void) {
  self.on(event, callback)
  return () => {
    self.off(event, callback)
  }
}
