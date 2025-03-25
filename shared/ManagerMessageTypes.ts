// ManagerMessageTypes.ts

import { BroadcastAllMessage, BroadcastMessage, ConnectionMessage, DisconnectionMessage, NameChangeMessage } from "./ServerMessageTypes"

/* Messages that the manager receives from its clients.
   (These are sent by clients to the manager.) */
export interface ServerAuthRequest {
    type: 'auth'
    data: {
        token: string
    }
}

export interface ServerDevicesRequest {
    type: 'devices'
    data: {
        requestId: string
        id: number
    }
}

export type ServerBroadcast = BroadcastMessage

export type ServerBroadcastAll = BroadcastAllMessage

export interface ServerChangeName {
    type: 'name-change'
    data: {
        id: number
        deviceName: string
        deviceId: string
    }
}

export interface ServerPing {
    type: 'ping'
}

export interface ServerConnections {
    type: 'connections', data: {
        id: number,
        deviceId: string,
        deviceName: string
    }[]
}

// Union type for messages received by the manager.
export type ServerToManagerMessage =
    | ServerAuthRequest
    | ServerDevicesRequest
    | ServerBroadcast
    | ServerBroadcastAll
    | ServerChangeName
    | ServerPing
    | DisconnectionMessage
    | ConnectionMessage
    | ServerConnections
    | NameChangeMessage

/* Messages that the manager sends to its clients.
   (These are responses or notifications sent from the manager.) */
export interface ManagerAuthResponse {
    type: 'auth'
    success: boolean
    token?: string
}

export interface ManagerDevicesResponse {
    type: 'devices'
    data: {
        requestId: string
        devices: Array<{
            id: number
            deviceId: string
        }>
    }
}

export interface ManagerConnection {
    type: 'connection'
    data: { id: number; deviceId: string }
}

export interface ManagerConnections {
    type: 'connections'
    data: { id: number; deviceId: string }[]
}

export interface ManagerDisconnection {
    type: 'disconnection'
    data: { id: number; deviceId: string }
}

export interface ManagerPong {
    type: 'pong'
}

// Union type for messages sent by the manager.
export type ManagerToServerMessage =
    | ManagerAuthResponse
    | ManagerDevicesResponse
    | BroadcastAllMessage
    | BroadcastMessage
    | ManagerConnection
    | ManagerDisconnection
    | ManagerPong
    | ManagerConnections
    | NameChangeMessage