"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("@ideadesignmedia/config.js");
const ws_1 = require("ws");
const authTimeouts = new Map();
const authenticated = new Map();
const server = new ws_1.WebSocketServer({ port: parseInt(process.env.PORT) });
server.on('listening', () => {
    console.log('Server is listening on port', process.env.PORT);
});
server.on('connection', (ws) => {
    authTimeouts.set(ws, setTimeout(() => {
        ws.close();
    }, 5000));
    ws.on('close', () => {
        const authenticatedServer = authenticated.get(ws);
        if (authenticatedServer && authenticatedServer.size) {
            const disconnectedUsers = Array.from(authenticatedServer.entries()).flatMap(([id, devices]) => Array.from(devices).map((device) => ({ id, deviceId: device })));
            authenticated.forEach((map, socket) => {
                if (socket !== ws && map.has(disconnectedUsers[0].id)) {
                    for (let i = 0; i < disconnectedUsers.length; i++) {
                        socket.send(JSON.stringify({ type: 'disconnection', data: disconnectedUsers[i] }));
                    }
                }
            });
        }
        authenticated.delete(ws);
        clearTimeout(authTimeouts.get(ws));
        authTimeouts.delete(ws);
    });
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message.toString());
        }
        catch (error) {
            console.error('Invalid message:', message.toString());
            ws.close();
            return;
        }
        if (!data || !data.type) {
            console.error('Invalid message:', message.toString());
            ws.close();
            return;
        }
        switch (data.type) {
            case 'auth': {
                if (data.data.token === process.env.AUTH_TOKEN) {
                    authenticated.set(ws, new Map());
                    clearTimeout(authTimeouts.get(ws));
                    authTimeouts.delete(ws);
                    ws.send(JSON.stringify({ type: 'auth', success: true }));
                }
                else {
                    console.error('Authentication failed');
                    ws.send(JSON.stringify({ type: 'auth', success: false }));
                    ws.close();
                }
                break;
            }
            case 'ping': {
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
            }
            case 'name-change': {
                const { id: userId } = data.data;
                if (!userId) {
                    console.error('Invalid userId');
                    return;
                }
                authenticated.forEach((map, socket) => {
                    if (ws !== socket && map.has(userId)) {
                        socket.send(JSON.stringify(data));
                    }
                });
                break;
            }
            case 'devices': {
                const { requestId, id: userId } = data.data;
                if (!requestId || !userId) {
                    console.error('Invalid requestId or userId');
                    return;
                }
                const devices = [];
                authenticated.forEach((map) => {
                    if (map.has(userId)) {
                        map.get(userId)?.forEach((device) => {
                            devices.push({ deviceId: device, id: userId });
                        });
                    }
                });
                ws.send(JSON.stringify({ type: 'devices', data: { requestId, devices } }));
                break;
            }
            case 'broadcast': {
                const { id: userId, deviceId } = data.data;
                if (!userId || !deviceId) {
                    console.error('Invalid userId or deviceId');
                    return;
                }
                authenticated.forEach((map, socket) => {
                    if (socket !== ws) {
                        if (map.get(userId)?.has(deviceId)) {
                            socket.send(JSON.stringify(data));
                        }
                    }
                });
                break;
            }
            case 'broadcast-all': {
                const { id: userId } = data.data;
                if (!userId) {
                    console.error('Invalid userId');
                    return;
                }
                authenticated.forEach((map, socket) => {
                    if (socket !== ws && map.has(userId)) {
                        ws.send(JSON.stringify(data));
                    }
                });
                break;
            }
            case 'disconnection': {
                const { id: userId, deviceId } = data.data;
                if (!userId || !deviceId) {
                    console.error('Invalid userId or deviceId');
                    return;
                }
                authenticated.forEach((map, socket) => {
                    if (map.has(userId)) {
                        const user = map.get(userId);
                        if (ws === socket) {
                            if (user) {
                                user.delete(deviceId);
                                if (user.size === 0) {
                                    map.delete(userId);
                                }
                            }
                        }
                        else if (user) {
                            socket.send(JSON.stringify(data));
                        }
                    }
                });
                break;
            }
            case 'connection': {
                const { id: userId, deviceId } = data.data;
                if (!userId || !deviceId) {
                    console.error('Invalid userId or deviceId');
                    return;
                }
                authenticated.forEach((map, socket) => {
                    if (socket === ws) {
                        if (!map.has(userId)) {
                            map.set(userId, new Set());
                        }
                        map.get(userId)?.add(deviceId);
                    }
                    else if (map.has(userId)) {
                        const user = map.get(userId);
                        if (ws === socket) {
                            if (!user) {
                                map.set(userId, new Set());
                            }
                            map.get(userId)?.add(deviceId);
                        }
                        else if (user) {
                            socket.send(JSON.stringify(data));
                        }
                    }
                });
                break;
            }
            case 'connections': {
                const connections = data.data;
                for (let i = 0; i < connections.length; i++) {
                    const { id: userId, deviceId } = connections[i];
                    if (!userId || !deviceId) {
                        console.error('Invalid userId or deviceId');
                        return;
                    }
                    authenticated.forEach((map, socket) => {
                        if (ws === socket) {
                            if (!map.has(userId)) {
                                map.set(userId, new Set());
                            }
                            map.get(userId)?.add(deviceId);
                        }
                        else if (map.has(userId)) {
                            socket.send(JSON.stringify({ type: 'connection', data: connections[i] }));
                        }
                    });
                }
                break;
            }
            default: {
                console.error('Unknown message type:', data?.type);
                break;
            }
        }
    });
});
