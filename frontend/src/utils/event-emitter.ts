export class EventEmitter {
    listeners: { [key: string]: ((data: any) => void)[] } = {}
    on(event: string, listener: (data: any) => void) {
        if (!this.listeners[event]) {
            this.listeners[event] = []
        }
        this.listeners[event].push(listener)
    }
    off(event: string, listener: (data: any) => void) {
        if (!this.listeners[event]) return
        this.listeners[event] = this.listeners[event].filter(l => l !== listener)
    }
    removeAllListeners(event?: string) {
        if (event) {
            delete this.listeners[event]
        } else {
            this.listeners = {}
        }
    }
    once(event: string, listener: (data: any) => void) {
        const onceListener = (data: any) => {
            listener(data)
            this.off(event, onceListener)
        }
        this.on(event, onceListener)
    }
    emit(event: string, data: any) {
        if (!this.listeners[event]) return
        this.listeners[event].forEach(listener => listener(data))
    }
}
export default EventEmitter