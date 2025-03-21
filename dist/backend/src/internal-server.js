"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = exports.userSockets = exports.authTimeouts = exports.clientRequests = exports.clients = void 0;
const AuthService_1 = require("./AuthService");
const ws_1 = require("ws");
const external_server_1 = require("./external-server");
exports.clients = new Map();
exports.clientRequests = new Map();
exports.authTimeouts = new Map();
exports.userSockets = new Map();
const startServer = () => {
    const wss = new ws_1.WebSocketServer({ port: Number(process.env.PORT) || 8080 });
    wss.on('connection', (ws) => {
        exports.clients.set(ws, { id: 0, authorized: false });
        exports.authTimeouts.set(ws, setTimeout(() => {
            ws.close();
        }, 30000));
        ws.on('close', () => {
            clearTimeout(exports.authTimeouts.get(ws));
            exports.authTimeouts.delete(ws);
            const userInfo = exports.clients.get(ws);
            if (userInfo) {
                if (userInfo.authorized) {
                    (0, external_server_1.queMessage)({ type: 'disconnection', data: { id: userInfo.id, deviceId: userInfo.deviceId } });
                }
            }
            exports.clients.delete(ws);
            const requests = Array.from(exports.clientRequests.entries());
            for (let i = 0; i < requests.length; i++) {
                if (requests[i][1] === ws) {
                    exports.clientRequests.delete(requests[i][0]);
                }
            }
            const userSocket = exports.userSockets.get(userInfo?.id || 0);
            if (userSocket) {
                userSocket.delete(userInfo?.deviceId || '');
                if (!userSocket.size) {
                    exports.userSockets.delete(userInfo?.id || 0);
                }
                else if (userInfo?.authorized) {
                    userSocket.forEach((socket) => {
                        const disconnMsg = { type: 'disconnection', data: { id: userInfo.id, deviceId: userInfo.deviceId } };
                        socket.send(JSON.stringify(disconnMsg));
                    });
                }
            }
        });
        ws.on('message', (message) => {
            let data;
            try {
                data = JSON.parse(message);
            }
            catch (e) {
                console.error('Invalid JSON:', message);
                ws.close();
                return;
            }
            if (!data || !data.type) {
                console.error('Invalid message:', message);
                ws.close();
                return;
            }
            const userInfo = exports.clients.get(ws);
            if (!userInfo) {
                console.error('Invalid client');
                return;
            }
            if (!userInfo.authorized && data.type !== 'auth') {
                console.error('Unauthorized client');
                ws.close();
                return;
            }
            switch (data.type) {
                case 'auth': {
                    const auth = data.data;
                    if (!auth || !auth.deviceId || (!auth.token && (!auth.username || !auth.password))) {
                        console.error('Invalid auth data');
                        const errorMsg = { type: 'auth', data: { error: 'Invalid auth data' } };
                        ws.send(JSON.stringify(errorMsg));
                        ws.close();
                        return;
                    }
                    if (auth.token) {
                        AuthService_1.AuthService.getSession(auth.token, auth.deviceId).then((session) => {
                            if (!session) {
                                console.error('Invalid token', auth.token);
                                const errorMsg = { type: 'auth', data: { error: 'Invalid token' } };
                                ws.send(JSON.stringify(errorMsg));
                                ws.close();
                                return;
                            }
                            clearTimeout(exports.authTimeouts.get(ws));
                            exports.authTimeouts.delete(ws);
                            return AuthService_1.AuthService.getUser(session.user.id).then((user) => {
                                if (!user) {
                                    console.error('no user token', auth.token);
                                    const errorMsg = { type: 'auth', data: { error: 'Invalid token' } };
                                    ws.send(JSON.stringify(errorMsg));
                                    ws.close();
                                    return;
                                }
                                userInfo.id = user.id;
                                userInfo.deviceId = session.deviceId;
                                userInfo.authorized = true;
                                userInfo.deviceName = session.deviceName;
                                userInfo.session = session.id;
                                const authResponse = {
                                    type: 'auth',
                                    data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName, token: session.token }
                                };
                                ws.send(JSON.stringify(authResponse));
                                (0, external_server_1.queMessage)({ type: 'connection', data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName } });
                                if (exports.userSockets.has(user.id)) {
                                    const sockets = exports.userSockets.get(user.id);
                                    if (sockets) {
                                        sockets.forEach((socket, key) => {
                                            if (key === userInfo.deviceId)
                                                return;
                                            const connMsg = {
                                                type: 'connection',
                                                data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName }
                                            };
                                            socket.send(JSON.stringify(connMsg));
                                        });
                                        sockets.set(userInfo.deviceId, ws);
                                    }
                                    else {
                                        exports.userSockets.set(user.id, new Map());
                                        exports.userSockets.get(user.id)?.set(userInfo.deviceId, ws);
                                    }
                                }
                                else {
                                    exports.userSockets.set(user.id, new Map());
                                    exports.userSockets.get(user.id)?.set(userInfo.deviceId, ws);
                                }
                            });
                        }).catch((error) => {
                            console.error('Authentication error:', error);
                            const errorMsg = { type: 'auth', data: { error: 'Authentication error' } };
                            ws.send(JSON.stringify(errorMsg));
                            ws.close();
                        });
                    }
                    else {
                        if (!auth.username || !auth.password) {
                            console.error('Invalid auth data');
                            const errorMsg = { type: 'auth', data: { error: 'Invalid auth data' } };
                            ws.send(JSON.stringify(errorMsg));
                            ws.close();
                            return;
                        }
                        const username = auth.username.toLowerCase().trim();
                        const password = auth.password.trim();
                        AuthService_1.AuthService.authenticate(username, password).then(async (user) => {
                            if (!user && !auth.register) {
                                console.error('Invalid username or password');
                                const errorMsg = { type: 'auth', data: { error: 'Invalid username or password' } };
                                ws.send(JSON.stringify(errorMsg));
                                ws.close();
                                return;
                            }
                            if (!user) {
                                user = await AuthService_1.AuthService.exists(username);
                                if (!user) {
                                    user = await AuthService_1.AuthService.register(username, password);
                                }
                                else {
                                    console.error('Invalid username or password');
                                    const errorMsg = { type: 'auth', data: { error: 'Invalid username or password' } };
                                    ws.send(JSON.stringify(errorMsg));
                                    ws.close();
                                    return;
                                }
                            }
                            clearTimeout(exports.authTimeouts.get(ws));
                            exports.authTimeouts.delete(ws);
                            return AuthService_1.AuthService.createSession(user.id, auth.deviceId, auth.deviceName || ('User' + Date.now())).then((session) => {
                                userInfo.id = user.id;
                                userInfo.deviceId = auth.deviceId;
                                userInfo.authorized = true;
                                userInfo.deviceName = auth.deviceName;
                                userInfo.session = session.id;
                                const authResponse = {
                                    type: 'auth',
                                    data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName, token: session.token }
                                };
                                ws.send(JSON.stringify(authResponse));
                                (0, external_server_1.queMessage)({ type: 'connection', data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName } });
                                if (exports.userSockets.has(user.id)) {
                                    const sockets = exports.userSockets.get(user.id);
                                    if (sockets) {
                                        sockets.forEach((socket) => {
                                            const connMsg = {
                                                type: 'connection',
                                                data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName }
                                            };
                                            socket.send(JSON.stringify(connMsg));
                                        });
                                        sockets.set(userInfo.deviceId, ws);
                                    }
                                    else {
                                        exports.userSockets.set(user.id, new Map());
                                        exports.userSockets.get(user.id)?.set(userInfo.deviceId, ws);
                                    }
                                }
                                else {
                                    exports.userSockets.set(user.id, new Map());
                                    exports.userSockets.get(user.id)?.set(userInfo.deviceId, ws);
                                }
                            });
                        }).catch((error) => {
                            console.error('Authentication error:', error);
                            const errorMsg = { type: 'auth', data: { error: 'Authentication error' } };
                            ws.send(JSON.stringify(errorMsg));
                            ws.close();
                        });
                    }
                    break;
                }
                case 'ping': {
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                }
                case 'logout': {
                    if (!userInfo.authorized || !userInfo.session) {
                        console.error('Unauthorized client');
                        ws.close();
                        return;
                    }
                    AuthService_1.AuthService.deleteSession(userInfo.session).then(() => {
                        ws.close();
                    }).catch((error) => {
                        console.error('Logout error:', error);
                    });
                    break;
                }
                case 'devices': {
                    const requestId = data.requestId;
                    if (!requestId) {
                        console.error('Invalid requestId');
                        return;
                    }
                    exports.clientRequests.set(requestId, ws);
                    (0, external_server_1.queMessage)({ type: 'devices', data: { id: userInfo.id, requestId } });
                    break;
                }
                case 'broadcast': {
                    if (data.data) {
                        if (exports.userSockets.get(userInfo.id)?.has(data.data.deviceId)) {
                            exports.userSockets.get(userInfo.id)?.get(data.data.deviceId)?.send(JSON.stringify({
                                type: 'broadcast', data: {
                                    id: userInfo.id,
                                    from: userInfo.deviceId,
                                    deviceId: data.data.deviceId,
                                    payload: data.data.payload
                                }
                            }));
                        }
                        else {
                            (0, external_server_1.queMessage)({ type: 'broadcast', data: { id: userInfo.id, from: userInfo.deviceId, deviceId: data.data.deviceId, payload: data.data.payload } });
                        }
                    }
                    break;
                }
                case 'broadcast-all': {
                    if (data.data) {
                        exports.userSockets.get(userInfo.id)?.forEach((socket) => {
                            if (socket !== ws) {
                                socket.send(JSON.stringify({
                                    type: 'broadcast-all', data: {
                                        id: userInfo.id,
                                        from: userInfo.deviceId,
                                        payload: data.data.payload
                                    }
                                }));
                            }
                        });
                        (0, external_server_1.queMessage)({ type: 'broadcast-all', data: { id: userInfo.id, from: userInfo.deviceId, payload: data.data.payload } });
                    }
                    break;
                }
                case 'name-change': {
                    if (!data.data || typeof data.data !== 'string') {
                        console.error('Invalid name-change data');
                        return;
                    }
                    AuthService_1.AuthService.updateDeviceName(userInfo.deviceId, data.data).then(() => {
                        userInfo.deviceName = data.data;
                        const nameChangeMsg = {
                            type: 'name-change',
                            data: { id: userInfo.id, deviceId: userInfo.deviceId, deviceName: userInfo.deviceName || ('device' + Date.now().toString()) }
                        };
                        (0, external_server_1.queMessage)(nameChangeMsg);
                        exports.userSockets.get(userInfo.id)?.forEach((client, key) => {
                            if (key === userInfo.deviceId)
                                return;
                            client.send(JSON.stringify(nameChangeMsg));
                        });
                    }).catch((error) => {
                        console.error('Name change error:', error);
                        const errorMsg = { type: 'name-change-error', data: { error: 'Name change error' } };
                        ws.send(JSON.stringify(errorMsg));
                    });
                    break;
                }
                default: {
                    console.error('Invalid message type:', data?.type);
                    ws.close();
                    break;
                }
            }
        });
    });
    wss.on('error', (error) => {
        console.error('WebSocket server error:', error);
    });
    wss.on('close', () => {
        console.error('WebSocket server closed');
        process.exit(1);
    });
};
exports.startServer = startServer;
