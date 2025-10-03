// ServerMessageTypes.ts

export interface BaseServerMessage {
    type: string;
}

export interface AuthResponseMessage extends BaseServerMessage {
    type: "auth";
    data: {
        id?: number;
        deviceId?: string;
        deviceName?: string;
        token?: string;
        error?: string;
    };
}

export interface ConnectionMessage extends BaseServerMessage {
    type: "connection";
    data: {
        id: number;
        deviceId: string;
        deviceName: string;
    };
}

export interface DisconnectionMessage extends BaseServerMessage {
    type: "disconnection";
    data: {
        id: number;
        deviceId: string;
    };
}

export interface NameChangeMessage extends BaseServerMessage {
    type: "name-change";
    data: {
        id: number;
        deviceId: string;
        deviceName: string;
    };
}

export interface NameChangeError extends BaseServerMessage {
    type: "name-change-error";
    data: {
        error: string;
    };
}

export interface ServerDeviceMessage extends BaseServerMessage { type: 'devices', data: { devices: { deviceId: string, id: number, deviceName: string }[] } }

export interface BroadcastMessage extends BaseServerMessage {
    type: "broadcast";
    data: {
        id: number;
        from: string;
        deviceId: string;
        payload: any;
    };
}

export interface BroadcastAllMessage extends BaseServerMessage {
    type: "broadcast-all";
    data: {
        id: number;
        from: string;
        payload: any;
    };
}

export interface ServerPong extends BaseServerMessage {
    type: "pong";
}

export interface ServerPing extends BaseServerMessage {
    type: "ping";
}

export interface ShareCreatedMessage extends BaseServerMessage {
    type: 'share-created'
    data: { token: string }
}

export interface ShareGuestAcceptedMessage extends BaseServerMessage {
    type: 'share-guest-accepted'
    data: { token: string, meta: { files: { name: string; size: number; type: string }[] } }
}

export interface ShareGuestConnectedMessage extends BaseServerMessage {
    type: 'share-guest-connected'
    data: { token: string }
}

export interface ShareSignalServerMessage extends BaseServerMessage {
    type: 'share-signal'
    data: { token: string, from: 'sender' | 'guest', payload: any }
}

export interface ShareErrorMessage extends BaseServerMessage {
    type: 'share-error'
    data: { token?: string, error: string }
}

export interface QrCreatedMessage extends BaseServerMessage {
    type: 'qr-created'
    data: { requestId: string, dataUrl: string }
}

export interface ShareStatusResponse extends BaseServerMessage {
    type: 'share-status'
    data: { token: string, guest: boolean }
}
// You can add more message types as needed

export type ServerMessage =
    | AuthResponseMessage
    | ConnectionMessage
    | DisconnectionMessage
    | NameChangeMessage
    | ServerDeviceMessage
    | NameChangeError
    | BroadcastMessage
    | BroadcastAllMessage
    | ServerPong
    | ServerPing
    | ShareCreatedMessage
    | ShareGuestAcceptedMessage
    | ShareGuestConnectedMessage
    | ShareSignalServerMessage
    | ShareErrorMessage
    | QrCreatedMessage
    | ShareStatusResponse
