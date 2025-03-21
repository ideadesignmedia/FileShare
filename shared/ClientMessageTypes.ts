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
  // Union type for all expected client messages
  export type ClientMessage =
    | AuthMessage
    | LogoutMessage
    | DevicesMessage
    | BroadcastMessage
    | BroadcastAllMessage
    | NameChangeMessage
    | ClientPing