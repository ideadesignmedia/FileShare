import WebSocket from "ws"
import { clientRequests, clients, userSockets, type UserInfo } from "./internal-server"
import { BroadcastAllMessage, BroadcastMessage, ServerDeviceMessage, NameChangeMessage } from "../../shared/ServerMessageTypes"
import { ManagerConnection, ManagerDisconnection, ManagerToServerMessage, ServerAuthRequest, ServerConnections, ServerToManagerMessage } from "../../shared/ManagerMessageTypes"

type ServerStatus = {
    connected: boolean,
    disconnections: number,
    serverReconnect: any | null
}
type QueuedMessage = ServerToManagerMessage[]
const serverMessages: QueuedMessage = []
const serverStatus: ServerStatus = {
    connected: false,
    disconnections: 0,
    serverReconnect: null
}
var server: WebSocket | null = null
var sending = false
export const connectToServer = () => {
    if (server) {
        console.log('Already connected to server')
        return server
    }
    const external = new WebSocket(process.env.SERVER_URL || 'ws://localhost:3000')
    server = external
    external.on('open', () => {
        console.log('Connected to external server')
        serverStatus.disconnections = 0
        if (serverStatus.serverReconnect) {
            clearTimeout(serverStatus.serverReconnect)
        }
        external.on('message', (message) => {
            let data: ManagerToServerMessage
            try {
                data = JSON.parse(message.toString())
            } catch (e) {
                console.error('Invalid JSON:', message.toString())
                return
            }
            if (!data || !data.type) {
                console.error('Invalid message:', message.toString())
                return
            }
            switch (data.type) {
                case 'auth': {
                    if (data.success) {
                        serverStatus.connected = true
                        const users: UserInfo[] = []
                        Array.from(clients.values()).forEach((client) => {
                            if (client.authorized) {
                                users.push(client)
                            }
                        })
                        // Send back a connections update using a ServerToManagerMessage
                        queMessage({ type: 'connections', data: users } as ServerConnections)
                    } else {
                        console.error('Authentication failed')
                        process.exit(1)
                    }
                    break
                }
                case 'devices': {
                    const requestId = data.data.requestId
                    if (!requestId) {
                        console.error('Invalid requestId')
                        return
                    }
                    const client = clientRequests.get(requestId)
                    if (!client) {
                        console.error('Invalid client')
                        return
                    }
                    client.send(JSON.stringify({ type: 'devices', data: { devices: data.data.devices } } as ServerDeviceMessage))
                    clientRequests.delete(requestId)
                    break
                }
                case 'broadcast': {
                    userSockets.get(data.data.id)?.get(data.data.deviceId)?.send(JSON.stringify(data as BroadcastMessage))
                    break
                }
                case 'broadcast-all': {
                    userSockets.get((data as BroadcastAllMessage).data.id)?.forEach((socket, key) => {
                        if (key === (data as BroadcastAllMessage).data.from) return
                        socket.send(JSON.stringify(data as BroadcastAllMessage))
                    })
                    break
                }
                case 'name-change': {
                    userSockets.get((data as NameChangeMessage).data.id)?.forEach((socket, key) => {
                        if (key === (data as NameChangeMessage).data.deviceId) return
                        socket.send(JSON.stringify(data))
                    })
                    break
                }
                case 'disconnection': {
                    userSockets.get((data as ManagerDisconnection).data.id)?.forEach((socket, key) => {
                        if (key === (data as ManagerDisconnection).data.deviceId) return
                        socket.send(JSON.stringify(data as ManagerDisconnection))
                    })
                    break
                }
                case 'connection': {
                    userSockets.get((data as ManagerConnection).data.id)?.forEach((socket, key) => {
                        if (key === (data as ManagerConnection).data.deviceId) return
                        socket.send(JSON.stringify(data as ManagerConnection))
                    })
                    break
                }
                default: {
                    console.error('Unknown message type:', data.type)
                    break
                }
            }
        })
        // Send an auth message to the backend using a ServerToManagerMessage
        external.send(JSON.stringify({ type: 'auth', data: { token: process.env.SERVER_TOKEN as string } } as ServerAuthRequest))
    })
    external.on('error', (error) => {
        console.error('Error connecting to external server:', error)
        serverStatus.disconnections++
        serverStatus.connected = false
        server = null
        if (serverStatus.serverReconnect) clearTimeout(serverStatus.serverReconnect)
        serverStatus.serverReconnect = setTimeout(() => {
            serverStatus.serverReconnect = null
            server = connectToServer()
        }, 1000 + serverStatus.disconnections * 3000)
    })
    external.on('close', () => {
        server = null
        console.log('Disconnected from external server')
        serverStatus.disconnections++
        serverStatus.connected = false
        if (serverStatus.serverReconnect) clearTimeout(serverStatus.serverReconnect)
        serverStatus.serverReconnect = setTimeout(() => {
            serverStatus.serverReconnect = null
            server = connectToServer()
        }, 1000 + serverStatus.disconnections * 3000)
    })
    return external
}
export const queMessage = (data: ServerToManagerMessage) => {
    serverMessages.push(data);
    sendToServer();
};

export const sendToServer = () => {
    if (sending) return;
    sending = true;
    if (!server || !serverStatus.connected || server.readyState !== WebSocket.OPEN || serverStatus.serverReconnect) {
        sending = false;
        setTimeout(sendToServer, 250);
        return;
    }

    if (!serverMessages.length) {
        sending = false;
        return;
    }

    const message = serverMessages.shift();
    if (!message) {
        sending = false;
        return;
    }

    try {
        server.send(JSON.stringify(message));
    } catch (error) {
        console.error("WebSocket send error:", error);
        serverMessages.unshift(message); // Put message back in queue
    }
    sending = false;
    // Continue sending next message if any remain
    if (serverMessages.length) {
        setTimeout(sendToServer, 10); // Small delay to avoid blocking
    }
};