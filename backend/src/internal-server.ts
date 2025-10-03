import { AuthService } from './AuthService'
import WebSocket, { WebSocketServer } from 'ws'
import QRCode from 'qrcode'
import { queMessage } from './external-server'
import { ClientMessage, DevicesMessage, NameChangeMessage } from '../../shared/ClientMessageTypes'
import { AuthResponseMessage, ConnectionMessage, DisconnectionMessage, NameChangeError, BroadcastMessage, BroadcastAllMessage } from '../../shared/ServerMessageTypes'
import { ServerBroadcast, ServerBroadcastAll, ServerChangeName, ServerDevicesRequest } from '../../shared/ManagerMessageTypes'

export type UserInfo = {
    id: number,
    session?: number,
    deviceId?: string,
    deviceName?: string,
    authorized: boolean
}

export const clients = new Map<WebSocket, UserInfo>()
export const clientRequests = new Map<string, WebSocket>()
export const authTimeouts = new Map<WebSocket, ReturnType<typeof setTimeout>>()
const pingTimeouts = new Map<WebSocket, ReturnType<typeof setTimeout>>()
export const userSockets = new Map<number, Map<string, WebSocket>>()
type ShareSession = {
    token: string,
    passSalt: string,
    passHash: string,
    meta?: { files: { name: string, size: number, type: string }[] },
    sender?: WebSocket,
    guest?: WebSocket,
    createdAt: number
}

const shareSessions = new Map<string, ShareSession>()
const socketShares = new Map<WebSocket, Set<string>>()

const genSalt = () => (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 16)
const passHash = (pass: string, salt: string) => {
    const crypto = require('crypto') as typeof import('crypto')
    return crypto.createHash('sha256').update(`${salt}:${pass}`).digest('hex')
}

export const startServer = () => {
    const wss = new WebSocketServer({ port: Number((() => {
        let port = parseInt(process.argv.slice(2)[0])
        if (Number.isNaN(port)) {
            port = Number(process.env.PORT)
        }
        if (Number.isNaN(port)) {
            port = 8080
        }
        return port
    })())})
    wss.on('connection', (ws: WebSocket) => {
        clients.set(ws, { id: 0, authorized: false })
        authTimeouts.set(ws, setTimeout(() => {
            ws.close()
        }, 30000))
        const handleCleanup = () => {
            clearTimeout(pingTimeouts.get(ws))
            clearTimeout(authTimeouts.get(ws))
            authTimeouts.delete(ws)
            const userInfo = clients.get(ws)
            if (userInfo) {
                if (userInfo.authorized) {
                    queMessage({ type: 'disconnection', data: { id: userInfo.id, deviceId: userInfo.deviceId } } as DisconnectionMessage)
                }
            }
            clients.delete(ws)
            const shares = socketShares.get(ws)
            if (shares) {
                shares.forEach((token) => {
                    const sess = shareSessions.get(token)
                    if (sess) {
                        if (sess.sender === ws) sess.sender = undefined
                        if (sess.guest === ws) sess.guest = undefined
                        if (!sess.sender && !sess.guest) {
                            shareSessions.delete(token)
                        }
                    }
                })
                socketShares.delete(ws)
            }
            const requests = Array.from(clientRequests.entries())
            for (let i = 0; i < requests.length; i++) {
                if (requests[i][1] === ws) {
                    clientRequests.delete(requests[i][0])
                }
            }
            const userSocket = userSockets.get(userInfo?.id || 0)
            if (userSocket) {
                userSocket.delete(userInfo?.deviceId || '')
                if (!userSocket.size) {
                    userSockets.delete(userInfo?.id || 0)
                } else if (userInfo?.authorized) {
                    userSocket.forEach((socket) => {
                        const disconnMsg: DisconnectionMessage = { type: 'disconnection', data: { id: (userInfo as UserInfo).id, deviceId: (userInfo as UserInfo).deviceId as string } }
                        socket.send(JSON.stringify(disconnMsg))
                    })
                }
            }
        }
        const ping = () => {
            clearTimeout(pingTimeouts.get(ws))
            const pingTimeout = () => ws.terminate()
            ws.send(JSON.stringify({ type: 'ping' }))
            pingTimeouts.set(ws, setTimeout(pingTimeout, 3000))
        }
        ws.on('close', handleCleanup)
        ws.on('error', (err) => {
            console.error(err)
            if (ws.readyState !== ws.OPEN && ws.readyState !== ws.CONNECTING) {
                
            } 
        })
        ws.on('message', (message: string) => {
            let data: ClientMessage
            try {
                data = JSON.parse(message) as ClientMessage
            } catch (e) {
                console.error('Invalid JSON:', message)
                ws.close()
                return
            }
            if (!data || !data.type) {
                console.error('Invalid message:', message)
                ws.close()
                return
            }
            const userInfo = clients.get(ws)
            if (!userInfo) {
                console.error('Invalid client')
                return
            }
            if (!userInfo.authorized) {
                if (data.type === 'auth' || data.type === 'ping' || data.type === 'pong' || data.type === 'share-guest-join') {
                    // allowed unauth messages
                } else if (data.type === 'share-signal') {
                    // allow share-signal only if this ws belongs to an existing guest session
                    const token = (data as any)?.data?.token
                    const sess = token ? shareSessions.get(token) : undefined
                    if (!sess || (sess.guest !== ws && sess.sender !== ws)) {
                        console.error('Unauthorized client share-signal')
                        ws.close()
                        return
                    }
                } else if (data.type === 'qr-create') {
                    console.error('Unauthorized client qr-create')
                    ws.close()
                    return
                } else {
                    console.error('Unauthorized client')
                    ws.close()
                    return
                }
            }
            switch (data.type) {
                case 'share-guest-join': {
                    const { token, passcode } = (data as any).data || {}
                    if (!token || typeof passcode !== 'string') {
                        const error = { type: 'share-error', data: { error: 'Invalid share join' } }
                        try { ws.send(JSON.stringify(error)) } catch {}
                        return
                    }
                    const sess = shareSessions.get(token)
                    if (!sess) {
                        const err = { type: 'share-error', data: { token, error: 'Invalid or expired link' } }
                        try { ws.send(JSON.stringify(err)) } catch {}
                        return
                    }
                    const hash = passHash(passcode, sess.passSalt)
                    if (hash !== sess.passHash) {
                        const err = { type: 'share-error', data: { token, error: 'Incorrect passcode' } }
                        try { ws.send(JSON.stringify(err)) } catch {}
                        return
                    }
                    clearTimeout(authTimeouts.get(ws))
                    authTimeouts.delete(ws)
                    try { console.log('[WS][Share] guest-join accepted', token) } catch {}
                    sess.guest = ws
                    if (!socketShares.has(ws)) socketShares.set(ws, new Set())
                    socketShares.get(ws)?.add(token)
                    const accepted = { type: 'share-guest-accepted', data: { token, meta: sess.meta || { files: [] } } }
                    try { ws.send(JSON.stringify(accepted)) } catch {}
                    if (sess.sender) {
                        try { sess.sender.send(JSON.stringify({ type: 'share-guest-connected', data: { token } })) } catch {}
                    }
                    break
                }
                case 'share-create': {
                    if (!userInfo.authorized) {
                        console.error('Unauthorized share-create')
                        ws.close()
                        return
                    }
                    const { token: providedToken, passcode, meta } = (data as any).data || {}
                    const token = (providedToken && typeof providedToken === 'string') ? providedToken : (Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4))
                    const salt = genSalt()
                    const hash = passHash(passcode || '', salt)
                    const sess: ShareSession = { token, passSalt: salt, passHash: hash, meta, createdAt: Date.now(), sender: ws }
                    shareSessions.set(token, sess)
                    if (!socketShares.has(ws)) socketShares.set(ws, new Set())
                    socketShares.get(ws)?.add(token)
                    try { console.log('[WS][Share] created', token) } catch {}
                    const msg = { type: 'share-created', data: { token } }
                    try { ws.send(JSON.stringify(msg)) } catch {}
                    break
                }
                case 'share-signal': {
                    const { token, payload } = (data as any).data || {}
                    const sess = token ? shareSessions.get(token) : undefined
                    if (!sess) {
                        const err = { type: 'share-error', data: { token, error: 'Invalid session' } }
                        try { ws.send(JSON.stringify(err)) } catch {}
                        return
                    }
                    const target = (sess.sender === ws) ? sess.guest : (sess.guest === ws ? sess.sender : null)
                    const from: 'sender' | 'guest' = (sess.sender === ws) ? 'sender' : 'guest'
                    if (target && target.readyState === target.OPEN) {
                        try { console.log('[WS][Share] signal', from, '->', (from === 'sender' ? 'guest' : 'sender'), (payload && payload.type) || 'unknown') } catch {}
                        try { target.send(JSON.stringify({ type: 'share-signal', data: { token, from, payload } })) } catch {}
                    }
                    break
                }
                case 'share-status': {
                    if (!userInfo.authorized) {
                        ws.close()
                        return
                    }
                    const token = (data as any)?.data?.token
                    const sess = token ? shareSessions.get(token) : undefined
                    const guest = Boolean(sess?.guest)
                    try { console.log('[WS][Share] status', token, 'guest:', guest) } catch {}
                    try { ws.send(JSON.stringify({ type: 'share-status', data: { token, guest } })) } catch {}
                    break
                }
                case 'qr-create': {
                    if (!userInfo.authorized) {
                        console.error('Unauthorized qr-create')
                        ws.close()
                        return
                    }
                    const { requestId, text } = (data as any).data || {}
                    if (!requestId || typeof text !== 'string') return
                    QRCode.toDataURL(text, { margin: 1, width: 256 }).then((dataUrl) => {
                        try { ws.send(JSON.stringify({ type: 'qr-created', data: { requestId, dataUrl } })) } catch {}
                    }).catch(() => {
                        try { ws.send(JSON.stringify({ type: 'qr-created', data: { requestId, dataUrl: '' } })) } catch {}
                    })
                    break
                }
                case 'share-close': {
                    const { token } = (data as any).data || {}
                    const sess = token ? shareSessions.get(token) : undefined
                    if (sess) {
                        if (sess.sender && sess.sender !== ws) try { sess.sender.send(JSON.stringify({ type: 'share-error', data: { token, error: 'closed' } })) } catch {}
                        if (sess.guest && sess.guest !== ws) try { sess.guest.send(JSON.stringify({ type: 'share-error', data: { token, error: 'closed' } })) } catch {}
                        shareSessions.delete(token)
                    }
                    break
                }
                case 'auth': {
                    const auth = data.data
                    if (!auth || !auth.deviceId || (!auth.token && (!auth.username || !auth.password))) {
                        console.error('Invalid auth data')
                        const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Invalid auth data' } }
                        ws.send(JSON.stringify(errorMsg))
                        ws.close()
                        return
                    }
                    if (auth.token) {
                        AuthService.getSession(auth.token, auth.deviceId).then((session) => {
                            if (!session) {
                                console.error('Invalid token', auth.token)
                                const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Invalid token' } }
                                ws.send(JSON.stringify(errorMsg))
                                ws.close()
                                return
                            }
                            clearTimeout(authTimeouts.get(ws))
                            authTimeouts.delete(ws)
                            return AuthService.getUser(session.user.id).then((user) => {
                                if (!user) {
                                    console.error('no user token', auth.token)
                                    const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Invalid token' } }
                                    ws.send(JSON.stringify(errorMsg))
                                    ws.close()
                                    return
                                }
                                userInfo.id = user.id
                                userInfo.deviceId = session.deviceId
                                userInfo.authorized = true
                                userInfo.deviceName = session.deviceName
                                userInfo.session = session.id
                                const authResponse: AuthResponseMessage = {
                                    type: 'auth',
                                    data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName, token: session.token }
                                }
                                ws.send(JSON.stringify(authResponse))
                                ping()
                                queMessage({ type: 'connection', data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName } } as ConnectionMessage)
                                if (userSockets.has(user.id)) {
                                    const sockets = userSockets.get(user.id)
                                    if (sockets) {
                                        sockets.forEach((socket, key) => {
                                            if (key === userInfo.deviceId) return
                                            const connMsg: ConnectionMessage = {
                                                type: 'connection',
                                                data: { id: userInfo.id, deviceId: userInfo.deviceId as string, deviceName: userInfo.deviceName as string }
                                            }
                                            socket.send(JSON.stringify(connMsg))
                                        })
                                        sockets.set(userInfo.deviceId, ws)
                                    } else {
                                        userSockets.set(user.id, new Map())
                                        userSockets.get(user.id)?.set(userInfo.deviceId, ws)
                                    }
                                } else {
                                    userSockets.set(user.id, new Map())
                                    userSockets.get(user.id)?.set(userInfo.deviceId, ws)
                                }
                            })
                        }).catch((error) => {
                            console.error('Authentication error:', error)
                            const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Authentication error' } }
                            ws.send(JSON.stringify(errorMsg))
                            ws.close()
                        })
                    } else {
                        if (!auth.username || !auth.password) {
                            console.error('Invalid auth data')
                            const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Invalid auth data' } }
                            ws.send(JSON.stringify(errorMsg))
                            ws.close()
                            return
                        }
                        const username = auth.username.toLowerCase().trim()
                        const password = auth.password.trim()
                        AuthService.authenticate(username, password).then(async (user) => {
                            if (!user && !auth.register) {
                                console.error('Invalid username or password')
                                const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Invalid username or password' } }
                                ws.send(JSON.stringify(errorMsg))
                                ws.close()
                                return
                            }
                            if (!user) {
                                user = await AuthService.exists(username)
                                if (!user) {
                                    user = await AuthService.register(username, password)
                                } else {
                                    console.error('Invalid username or password')
                                    const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Invalid username or password' } }
                                    ws.send(JSON.stringify(errorMsg))
                                    ws.close()
                                    return
                                }
                            }
                            clearTimeout(authTimeouts.get(ws))
                            authTimeouts.delete(ws)
                            return AuthService.createSession(user.id, auth.deviceId, auth.deviceName || ('User' + Date.now())).then((session) => {
                                userInfo.id = user!.id
                                userInfo.deviceId = auth.deviceId
                                userInfo.authorized = true
                                userInfo.deviceName = auth.deviceName
                                userInfo.session = session.id
                                const authResponse: AuthResponseMessage = {
                                    type: 'auth',
                                    data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName, token: session.token }
                                }
                                ws.send(JSON.stringify(authResponse))
                                queMessage({ type: 'connection', data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName } } as ConnectionMessage)
                                if (userSockets.has(user!.id)) {
                                    const sockets = userSockets.get(user!.id)
                                    if (sockets) {
                                        sockets.forEach((socket) => {
                                            const connMsg: ConnectionMessage = {
                                                type: 'connection',
                                                data: { id: (userInfo as UserInfo).id, deviceId: (userInfo as UserInfo).deviceId as string, deviceName: (userInfo as UserInfo).deviceName as string }
                                            }
                                            socket.send(JSON.stringify(connMsg))
                                        })
                                        sockets.set(userInfo.deviceId as string, ws)
                                    } else {
                                        userSockets.set(user!.id, new Map())
                                        userSockets.get(user!.id)?.set(userInfo.deviceId as string, ws)
                                    }
                                } else {
                                    userSockets.set(user!.id, new Map())
                                    userSockets.get(user!.id)?.set(userInfo.deviceId as string, ws)
                                }
                            })
                        }).catch((error) => {
                            console.error('Authentication error:', error)
                            const errorMsg: AuthResponseMessage = { type: 'auth', data: { error: 'Authentication error' } }
                            ws.send(JSON.stringify(errorMsg))
                            ws.close()
                        })
                    }
                    break;
                }
                case 'ping': {
                    ws.send(JSON.stringify({ type: 'pong' }))
                    break;
                }
                case 'pong': {
                    clearTimeout(pingTimeouts.get(ws))
                    pingTimeouts.set(ws, setTimeout(() => {
                        ping()
                    }, 15000))
                    break
                }
                case 'logout': {
                    if (!userInfo.authorized || !userInfo.session) {
                        console.error('Unauthorized client')
                        ws.close()
                        return
                    }
                    AuthService.deleteSession(userInfo.session).then(() => {
                        ws.close()
                    }).catch((error) => {
                        console.error('Logout error:', error)
                    })
                    break;
                }
                case 'devices': {
                    const requestId = (data as DevicesMessage).requestId
                    if (!requestId) {
                        console.error('Invalid requestId')
                        return
                    }
                    clientRequests.set(requestId, ws)
                    queMessage({ type: 'devices', data: { id: userInfo.id as number, requestId } } as ServerDevicesRequest)
                    break;
                }
                case 'broadcast': {
                    if (data.data) {
                        if (userSockets.get(userInfo.id)?.has(data.data.deviceId)) {
                            userSockets.get(userInfo.id)?.get(data.data.deviceId)?.send(JSON.stringify({
                                type: 'broadcast', data: {
                                    id: userInfo!.id,
                                    from: userInfo!.deviceId as string,
                                    deviceId: data.data.deviceId,
                                    payload: data.data.payload
                                }
                            } as BroadcastMessage))
                        } else {
                            queMessage({ type: 'broadcast', data: { id: userInfo.id, from: userInfo.deviceId, deviceId: data.data.deviceId, payload: data.data.payload } } as ServerBroadcast)
                        }
                    }
                    break;
                }
                case 'broadcast-all': {
                    if (data.data) {
                        userSockets.get(userInfo.id)?.forEach((socket) => {
                            if (socket !== ws) {
                                socket.send(JSON.stringify({
                                    type: 'broadcast-all', data: {
                                        id: userInfo!.id,
                                        from: userInfo!.deviceId as string,
                                        payload: (data as BroadcastAllMessage).data.payload
                                    }
                                } as BroadcastAllMessage))
                            }
                        })
                        queMessage({ type: 'broadcast-all', data: { id: userInfo.id, from: userInfo.deviceId, payload: data.data.payload } } as ServerBroadcastAll)
                    }
                    break;
                }
                case 'name-change': {
                    if (!data.data || typeof data.data !== 'string') {
                        console.error('Invalid name-change data')
                        return
                    }
                    AuthService.updateDeviceName(userInfo.deviceId as string, data.data).then(() => {
                        userInfo.deviceName = (data as NameChangeMessage).data as string
                        const nameChangeMsg: ServerChangeName = {
                            type: 'name-change',
                            data: { id: userInfo.id, deviceId: userInfo.deviceId as string, deviceName: userInfo.deviceName || ('device' + Date.now().toString()) }
                        }
                        queMessage(nameChangeMsg)
                        userSockets.get(userInfo.id)?.forEach((client, key) => {
                            if (key === userInfo.deviceId) return
                            client.send(JSON.stringify(nameChangeMsg))
                        })
                    }).catch((error) => {
                        console.error('Name change error:', error)
                        const errorMsg: NameChangeError = { type: 'name-change-error', data: { error: 'Name change error' } }
                        ws.send(JSON.stringify(errorMsg))
                    })
                    break;
                }
                default: {
                    console.error('Invalid message type:', (data as any)?.type)
                    ws.close()
                    break;
                }
            }
        })
    })
    wss.on('error', (error) => {
        console.error('WebSocket server error:', error)
    })
    wss.on('close', () => {
        console.error('WebSocket server closed')
        process.exit(1)
    })
}
