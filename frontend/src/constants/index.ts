// WebSocket endpoint of the backend (separate domain is supported)
// Expect `VITE_WS_URL` like: ws://backend.example.com/ or wss://backend.example.com/
// Fallback (dev): same host + current port, root path
export const wsUrl = import.meta.env.VITE_WS_URL || (typeof window !== 'undefined' ? `ws://${window.location.hostname}:${window.location.port || '8080'}/` : '');
export const rtcOptions: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // If transfers fail across networks, add your TURN here
    // { urls: ['turn:your.turn.server:3478'], username: 'user', credential: 'pass' }
  ],
  iceTransportPolicy: "all"
}
if (!localStorage.getItem('device-id')) localStorage.setItem('device-id', Math.random().toString(36).substring(2));
export const deviceId = localStorage.getItem('device-id') || '';

// Detect WebKit browsers (Safari) and constrain data channel usage
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const isWebKit = /AppleWebKit/.test(ua)
const isWebKitMobile = isWebKit && /(Mobile|iP(ad|hone|od)|Android)/i.test(ua)

export const maxMessageSize = (isWebKit ? 16 * 1024 : (65536 - 300))
export const chunkSize = 1024 * 1024 // 1MB
export const maxBufferAmount = (isWebKit ? (2 * 1024 * 1024) : (16 * 1024 * 1024 - (maxMessageSize + 300)))
export const largeFileSize = 10 * 1024 * 1024; // 10MB
export const numberOfChannels = isWebKit ? 1 : 4;
