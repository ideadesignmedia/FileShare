import '@ideadesignmedia/config.js'
import WebSocket, { WebSocketServer } from 'ws'
import { ManagerAuthResponse, ManagerConnection, ManagerDevicesResponse, ManagerDisconnection, ManagerPong, ServerChangeName, ServerToManagerMessage } from '../../shared/ManagerMessageTypes'
import { BroadcastAllMessage, BroadcastMessage } from '../../shared/ClientMessageTypes'

const authTimeouts = new Map<WebSocket, any>()
const authenticated = new Map<WebSocket, Map<number, Set<string>>>()
const deviceNames = new Map<string, string>()
const server = new WebSocketServer({ port: parseInt(process.env.PORT as string) })
server.on('listening', () => {
    console.log('Server is listening on port', process.env.PORT)
})
server.on('connection', (ws) => {
    authTimeouts.set(ws, setTimeout(() => {
        ws.close()
    }, 5000))
    ws.on('close', () => {
        const authenticatedServer = authenticated.get(ws)
        if (authenticatedServer && authenticatedServer.size) {
            const disconnectedUsers = Array.from(authenticatedServer.entries()).flatMap(([id, devices]) => Array.from(devices).map((device) => ({ id, deviceId: device })))
            disconnectedUsers.forEach(user => {
                deviceNames.delete(user.deviceId)
            })
            authenticated.forEach((map, socket) => {
                if (socket !== ws && map.has(disconnectedUsers[0].id)) {
                    for (let i = 0; i < disconnectedUsers.length; i++) {
                        socket.send(JSON.stringify({ type: 'disconnection', data: disconnectedUsers[i] } as ManagerDisconnection))
                    }
                }
            })
        }
        authenticated.delete(ws)
        clearTimeout(authTimeouts.get(ws))
        authTimeouts.delete(ws)
    })
    ws.on('message', (message) => {
        let data: ServerToManagerMessage
        try {
            data = JSON.parse(message.toString())
        } catch (error) {
            console.error('Invalid message:', message.toString())
            ws.close()
            return
        }
        if (!data || !data.type) {
            console.error('Invalid message:', message.toString())
            ws.close()
            return
        }
        switch (data.type) {
            case 'auth': {
                if (data.data.token === process.env.AUTH_TOKEN) {
                    authenticated.set(ws, new Map())
                    clearTimeout(authTimeouts.get(ws))
                    authTimeouts.delete(ws)
                    ws.send(JSON.stringify({ type: 'auth', success: true } as ManagerAuthResponse))
                } else {
                    console.error('Authentication failed')
                    ws.send(JSON.stringify({ type: 'auth', success: false } as ManagerAuthResponse))
                    ws.close()
                }
                break
            }
            case 'ping': {
                ws.send(JSON.stringify({ type: 'pong' } as ManagerPong))
                break
            }
            case 'name-change': {
                const { id: userId, deviceId, deviceName } = data.data
                if (!userId) {
                    console.error('Invalid userId')
                    return
                }
                deviceNames.set(deviceId, deviceName)
                authenticated.forEach((map, socket) => {
                    if (ws !== socket && map.has(userId)) {
                        socket.send(JSON.stringify(data as ServerChangeName))
                    }
                })
                break
            }
            case 'devices': {
                const { requestId, id: userId } = data.data
                if (!requestId || !userId) {
                    console.error('Invalid requestId or userId')
                    return
                }
                const devices: { deviceId: string, id: number, deviceName: string }[] = []
                authenticated.forEach((map) => {
                    if (map.has(userId)) {
                        map.get(userId)?.forEach((device) => {
                            const deviceName = deviceNames.get(device) || ''
                            devices.push({ deviceId: device, id: userId, deviceName })
                        })
                    }
                })
                ws.send(JSON.stringify({ type: 'devices', data: { requestId, devices } } as ManagerDevicesResponse))
                break
            }
            case 'broadcast': {
                const { id: userId, deviceId } = data.data
                if (!userId || !deviceId) {
                    console.error('Invalid userId or deviceId')
                    return
                }
                authenticated.forEach((map, socket) => {
                    if (socket !== ws) {
                        if (map.get(userId)?.has(deviceId)) {
                            socket.send(JSON.stringify(data as BroadcastMessage))
                        }
                    }
                })
                break
            }
            case 'broadcast-all': {
                const { id: userId } = data.data
                if (!userId) {
                    console.error('Invalid userId')
                    return
                }
                authenticated.forEach((map, socket) => {
                    if (socket !== ws && map.has(userId)) {
                        ws.send(JSON.stringify(data as BroadcastAllMessage))
                    }
                })
                break
            }
            case 'disconnection': {
                const { id: userId, deviceId } = data.data
                if (!userId || !deviceId) {
                    console.error('Invalid userId or deviceId')
                    return
                }
                deviceNames.delete(deviceId)
                authenticated.forEach((map, socket) => {
                    if (map.has(userId)) {
                        const user = map.get(userId)
                        if (ws === socket) {
                            if (user) {
                                user.delete(deviceId)
                                if (user.size === 0) {
                                    map.delete(userId)
                                }
                            }
                        } else if (user) {
                            socket.send(JSON.stringify(data as ManagerDisconnection))
                        }
                    }
                })
                break
            }
            case 'connection': {
                const { id: userId, deviceId, deviceName } = data.data
                if (!userId || !deviceId) {
                    console.error('Invalid userId or deviceId')
                    return
                }
                deviceNames.set(deviceId, deviceName)
                authenticated.forEach((map, socket) => {
                    if (socket === ws) {
                        if (!map.has(userId)) {
                            map.set(userId, new Set())
                        }
                        map.get(userId)?.add(deviceId)
                    } else if (map.has(userId)) {
                        const user = map.get(userId)
                        if (ws === socket) {
                            if (!user) {
                                map.set(userId, new Set())
                            }
                            map.get(userId)?.add(deviceId)
                        } else if (user) {
                            socket.send(JSON.stringify(data as ManagerConnection))
                        }
                    }
                })
                break
            }
            case 'connections': {
                const connections = data.data
                for (let i = 0; i < connections.length; i++) {
                    const { id: userId, deviceId, deviceName } = connections[i]
                    if (!userId || !deviceId) {
                        console.error('Invalid userId or deviceId')
                        return
                    }
                    deviceNames.set(deviceId, deviceName)
                    authenticated.forEach((map, socket) => {
                        if (ws === socket) {
                            if (!map.has(userId)) {
                                map.set(userId, new Set())
                            }
                            map.get(userId)?.add(deviceId)
                        } else if (map.has(userId)) {
                            socket.send(JSON.stringify({ type: 'connection', data: connections[i] } as ManagerConnection))
                        }
                    })
                }
                break
            }
            default: {
                console.error('Unknown message type:', (data as any)?.type)
                break
            }
        }
    })
})