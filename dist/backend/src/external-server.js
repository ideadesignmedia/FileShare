"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToServer = exports.queMessage = exports.connectToServer = void 0;
const ws_1 = __importDefault(require("ws"));
const internal_server_1 = require("./internal-server");
const serverMessages = [];
const serverStatus = {
    connected: false,
    disconnections: 0,
    serverReconnect: null
};
var server = null;
var sending = false;
const connectToServer = () => {
    if (server) {
        console.log('Already connected to server');
        return server;
    }
    const external = new ws_1.default(process.env.SERVER_URL || 'ws://localhost:3000');
    server = external;
    external.on('open', () => {
        console.log('Connected to external server');
        serverStatus.disconnections = 0;
        if (serverStatus.serverReconnect) {
            clearTimeout(serverStatus.serverReconnect);
        }
        external.on('message', (message) => {
            let data;
            try {
                data = JSON.parse(message.toString());
            }
            catch (e) {
                console.error('Invalid JSON:', message.toString());
                return;
            }
            if (!data || !data.type) {
                console.error('Invalid message:', message.toString());
                return;
            }
            switch (data.type) {
                case 'auth': {
                    if (data.success) {
                        serverStatus.connected = true;
                        const users = [];
                        Array.from(internal_server_1.clients.values()).forEach((client) => {
                            if (client.authorized) {
                                users.push(client);
                            }
                        });
                        // Send back a connections update using a ServerToManagerMessage
                        (0, exports.queMessage)({ type: 'connections', data: users });
                    }
                    else {
                        console.error('Authentication failed');
                        process.exit(1);
                    }
                    break;
                }
                case 'devices': {
                    const requestId = data.data.requestId;
                    if (!requestId) {
                        console.error('Invalid requestId');
                        return;
                    }
                    const client = internal_server_1.clientRequests.get(requestId);
                    if (!client) {
                        console.error('Invalid client');
                        return;
                    }
                    client.send(JSON.stringify({ type: 'devices', data: { devices: data.data.devices } }));
                    internal_server_1.clientRequests.delete(requestId);
                    break;
                }
                case 'broadcast': {
                    internal_server_1.userSockets.get(data.data.id)?.get(data.data.deviceId)?.send(JSON.stringify(data));
                    break;
                }
                case 'broadcast-all': {
                    internal_server_1.userSockets.get(data.data.id)?.forEach((socket, key) => {
                        if (key === data.data.from)
                            return;
                        socket.send(JSON.stringify(data));
                    });
                    break;
                }
                case 'name-change': {
                    internal_server_1.userSockets.get(data.data.id)?.forEach((socket, key) => {
                        if (key === data.data.deviceId)
                            return;
                        socket.send(JSON.stringify(data));
                    });
                    break;
                }
                case 'disconnection': {
                    internal_server_1.userSockets.get(data.data.id)?.forEach((socket, key) => {
                        if (key === data.data.deviceId)
                            return;
                        socket.send(JSON.stringify(data));
                    });
                    break;
                }
                case 'connection': {
                    internal_server_1.userSockets.get(data.data.id)?.forEach((socket, key) => {
                        if (key === data.data.deviceId)
                            return;
                        socket.send(JSON.stringify(data));
                    });
                    break;
                }
                default: {
                    console.error('Unknown message type:', data.type);
                    break;
                }
            }
        });
        // Send an auth message to the backend using a ServerToManagerMessage
        external.send(JSON.stringify({ type: 'auth', data: { token: process.env.SERVER_TOKEN } }));
    });
    external.on('error', (error) => {
        console.error('Error connecting to external server:', error);
        serverStatus.disconnections++;
        serverStatus.connected = false;
        server = null;
        if (serverStatus.serverReconnect)
            clearTimeout(serverStatus.serverReconnect);
        serverStatus.serverReconnect = setTimeout(() => {
            server = (0, exports.connectToServer)();
        }, 1000 + serverStatus.disconnections * 3000);
    });
    external.on('close', () => {
        server = null;
        console.log('Disconnected from external server');
        serverStatus.disconnections++;
        serverStatus.connected = false;
        if (serverStatus.serverReconnect)
            clearTimeout(serverStatus.serverReconnect);
        serverStatus.serverReconnect = setTimeout(() => {
            server = (0, exports.connectToServer)();
        }, 1000 + serverStatus.disconnections * 3000);
    });
    return external;
};
exports.connectToServer = connectToServer;
const queMessage = (data) => {
    serverMessages.push(data);
    (0, exports.sendToServer)();
};
exports.queMessage = queMessage;
const sendToServer = () => {
    if (sending)
        return;
    sending = true;
    if (!server || !serverStatus.connected || server.readyState !== ws_1.default.OPEN || serverStatus.serverReconnect) {
        sending = false;
        setTimeout(exports.sendToServer, 250);
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
    }
    catch (error) {
        console.error("WebSocket send error:", error);
        serverMessages.unshift(message); // Put message back in queue
    }
    sending = false;
    // Continue sending next message if any remain
    if (serverMessages.length) {
        setTimeout(exports.sendToServer, 10); // Small delay to avoid blocking
    }
};
exports.sendToServer = sendToServer;
