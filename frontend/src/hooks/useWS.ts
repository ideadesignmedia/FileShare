import React, { useCallback, useEffect } from 'react'
import { ServerMessage } from '../../../shared/ServerMessageTypes';
import { ClientMessage } from '../../../shared/ClientMessageTypes';

export const useWS = (url: string, onMessage: (data: ServerMessage, send: (message: ClientMessage) => void) => void, onOpen?: (ws: WebSocket) => void, onClose?: (ws: WebSocket) => void, startClosed?: boolean) => {
    const [ws, setWS] = React.useState<WebSocket | null>(null);
    const [refreshSocket, setRefreshSocket] = React.useState(0);
    const wsRef = React.useRef<WebSocket | null>(null);
    const [authorized, setAuthorized] = React.useState(false)
    const authorizedRef = React.useRef(false)
    const sentAuthRef = React.useRef(false)
    const receivedAuthRef = React.useRef(false)
    const messageQueue = React.useRef<any[]>([])
    const closedRef = React.useRef(false)
    const reconnectRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const send = useCallback((data: ClientMessage) => {
        if (wsRef.current) {
            messageQueue.current.push(data)
            if (wsRef.current?.readyState === WebSocket.OPEN && authorizedRef.current) {
                while (messageQueue.current.length) {
                    wsRef.current.send(JSON.stringify(messageQueue.current.shift()))
                }
            } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !authorizedRef.current) {
                let authIndex = messageQueue.current.findIndex(m => m.type === 'auth')
                if (authIndex !== -1) {
                    wsRef.current.send(JSON.stringify(messageQueue.current[authIndex]))
                    messageQueue.current.splice(authIndex, 1)
                    sentAuthRef.current = true
                }
            }
        }
    }, [])
    useEffect(() => {
        authorizedRef.current = authorized
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && authorizedRef.current) {
            while (messageQueue.current.length) {
                wsRef.current.send(JSON.stringify(messageQueue.current.shift()))
            }
        }
    }, [authorized])
    const open = useCallback(() => {
        if (ws) ws.close(4900)
        closedRef.current = false
        setRefreshSocket(r => r + 1)
    }, [ws])
    const close = useCallback(() => {
        closedRef.current = true
        if (ws) ws.close(4900)
    }, [ws])
    useEffect(() => {
        return () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close(4900)
            }
        }
    }, [])
    const onData = useCallback((data: MessageEvent) => {
        let o: ServerMessage | null = null
        try {
            o = JSON.parse(data as any)
        } catch {
            try {
                o = JSON.parse(data.data)
            } catch { o = null }
        }
        if (o?.type === 'auth') {
            receivedAuthRef.current = true
        }
        if (o) {
            onMessage(o, send)
        } else if (data.data) {
            onMessage(data.data, send)
        }
    }, [onMessage, send])
    useEffect(() => {
        if (wsRef.current) {
            wsRef.current.onmessage = onData
        }
    }, [onData])
    React.useEffect(() => {
        if (!wsRef.current && !(startClosed && !refreshSocket) && !closedRef.current) {
            const createSocket = () => {
                sentAuthRef.current = false
                receivedAuthRef.current = false
                setAuthorized(false)
                reconnectRef.current = null
                let ws: WebSocket | null
                try {
                    ws = new WebSocket(url)
                } catch (e) {
                    console.error(e)
                    ws = null
                }
                if (!ws) {
                    return null
                }
                let lastPing = Date.now()
                const heartbeat = setInterval(() => {
                    lastPing = Date.now()
                    ws?.send(JSON.stringify({ type: 'ping' }))
                }, 30000)
                ws.onopen = () => {
                    if (onOpen) onOpen(ws as WebSocket)
                }
                ws.onmessage = onData
                const closeSocket = (event: CloseEvent) => {
                    const hasAuth = sentAuthRef.current && receivedAuthRef.current
                    setAuthorized(false)
                    sentAuthRef.current = false
                    receivedAuthRef.current = false
                    clearInterval(heartbeat)
                    messageQueue.current = []
                    if (onClose) onClose(ws as WebSocket)
                    if (event?.code === 4900 || !hasAuth) {
                        wsRef.current = null
                        setWS(null)
                        return true
                    }
                    if (!reconnectRef.current) {
                        reconnectRef.current = setTimeout(() => {
                            wsRef.current = createSocket()
                            setWS(wsRef.current)
                        }, 500)
                    }
                    return false

                }
                ws.onclose = closeSocket as any
                ws.onerror = (e: any) => {
                    console.error(e)
                }
                return ws
            }
            wsRef.current = createSocket()
            setWS(wsRef.current)
        }
    }, [url, refreshSocket]);
    useEffect(() => {
        if (!reconnectRef.current && !wsRef.current && !(startClosed && !refreshSocket) && !closedRef.current) {
            const reloadSocket = () => {
                reconnectRef.current = setTimeout(() => {
                    setRefreshSocket(a => a + 1)
                }, 500)
            }
            if (navigator.onLine) {
                reloadSocket()
            } else {
                window.addEventListener('online', reloadSocket, {once: true})
                return () => {
                    window.removeEventListener('online', reloadSocket)
                }
            }
         }
    }, [ws])
    return { ws, open, close, send, setAuthorized, authorized };
}