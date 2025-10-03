// MessageTypes.ts

export interface BaseMessage {
  type: string;
}

export interface AuthMessage extends BaseMessage {
  type: 'auth';
  data: {
    token?: string;
    deviceId: string;
    username?: string;
    password?: string;
    register?: boolean;
    deviceName?: string;
  };
}

export interface LogoutMessage extends BaseMessage {
  type: 'logout';
  // No extra data required for logout
}

export interface DevicesMessage extends BaseMessage {
  type: 'devices';
  requestId: string;
}

export interface BroadcastMessage extends BaseMessage {
  type: 'broadcast';
  data: {
    deviceId: string;
    payload: any;
  };
}

export interface BroadcastAllMessage extends BaseMessage {
  type: 'broadcast-all';
  data: {
    payload: any;
  };
}

export interface NameChangeMessage extends BaseMessage {
  type: 'name-change';
  data: string; // The new name
}

export interface ClientPing extends BaseMessage {
  type: 'ping';
}
export interface ClientPong extends BaseMessage {
  type: 'pong';
}

export interface ShareCreateMessage extends BaseMessage {
  type: 'share-create';
  data: {
    token?: string;
    passcode: string;
    meta: { files: { name: string; size: number; type: string }[] };
  };
}

export interface ShareSignalMessage extends BaseMessage {
  type: 'share-signal';
  data: { token: string; payload: any };
}

export interface ShareCloseMessage extends BaseMessage {
  type: 'share-close';
  data: { token: string };
}

export interface ShareGuestJoinMessage extends BaseMessage {
  type: 'share-guest-join';
  data: { token: string; passcode: string };
}

export interface QrCreateMessage extends BaseMessage {
  type: 'qr-create';
  data: { requestId: string; text: string };
}

export interface ShareStatusMessage extends BaseMessage {
  type: 'share-status';
  data: { token: string };
}
// Union type for all expected client messages
export type ClientMessage =
  | AuthMessage
  | LogoutMessage
  | DevicesMessage
  | BroadcastMessage
  | BroadcastAllMessage
  | NameChangeMessage
  | ClientPing
  | ClientPong
  | ShareCreateMessage
  | ShareSignalMessage
  | ShareCloseMessage
  | ShareGuestJoinMessage
  | QrCreateMessage
  | ShareStatusMessage
