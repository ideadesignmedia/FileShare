export const wsUrl = import.meta.env.VITE_WS_URL;
export const rtcOptions: RTCConfiguration = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    //Uncomment and add your own urls to use TURN server for better NAT traversal
/*     {
      "urls": ['turn:turn.ideadesignmedia.com:3331'],
      username: 'IDM',
      credential: 'TURNME'
    },
    {
      "urls": ['turn:turn.ideadesignmedia.com:3332'],
      username: 'IDM',
      credential: 'TURNME'
    } */
  ],
  iceTransportPolicy: "all"
}
if (!localStorage.getItem('device-id')) localStorage.setItem('device-id', Math.random().toString(36).substring(2));
export const deviceId = localStorage.getItem('device-id') || '';