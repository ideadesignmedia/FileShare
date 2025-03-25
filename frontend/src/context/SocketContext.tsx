import React, { createContext, useCallback, useContext } from 'react';
import { useWS } from '../hooks/useWS';
import { deviceId, wsUrl } from '../constants';
import { useAppContext } from './AppContext';
import { ServerMessage } from '../../../shared/ServerMessageTypes';
import { ClientMessage } from '../../../shared/ClientMessageTypes';

type SocketContextType = ReturnType<typeof useWS> & {
    setDeviceName: (name: string) => void
};
const SocketContext = createContext<SocketContextType | undefined>(undefined);
export const SocketProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    const { state, dispatch, emit } = useAppContext();
    const onSocketMessage = useCallback((data: ServerMessage, send: (data: ClientMessage) => void) => {
        switch (data.type) {
            case 'auth': {
                if (data.data.error || !data.data.token) {
                    setAuthorized(false);
                    localStorage.removeItem('token');
                    dispatch({ type: 'set-token', token: '' })
                    dispatch({ type: 'set-credentials', credentials: null });
                    dispatch({ type: 'set-loading', loading: false });
                    dispatch({ type: 'set-loaded', loaded: false })
                    dispatch({ type: 'set-peers', peers: [] })
                } else {
                    localStorage.setItem('token', data.data.token);
                    setAuthorized(true);
                    dispatch({ type: 'set-token', token: data.data.token });
                    dispatch({type: 'set-name', value: data.data.deviceName || ''})
                    send({ type: 'devices', requestId: 'devices' + Date.now() });
                }
                break;
            }
            case 'devices': {
                dispatch({
                    type: 'set-peers', peers: data.data.devices.filter(a => {
                        return a.deviceId !== deviceId
                    })
                });
                dispatch({ type: 'set-loading', loading: false });
                dispatch({ type: 'set-loaded', loaded: true });
                break;
            }
            case 'connection': {
                dispatch({ type: 'connection', peer: data.data });
                break;
            }
            case 'disconnection': {
                dispatch({ type: 'disconnection', peer: data.data });
                break;
            }
            case 'broadcast': {
                if (data.data.deviceId === deviceId) emit(data.data.from, data.data.payload);
                break
            }
            case 'broadcast-all': {
                emit('all', data.data);
                break
            }
            case 'name-change': {
                dispatch({type: 'update-name', value: {
                    deviceId: data.data.deviceId!,
                    deviceName: data.data.deviceName    
                }})
                break
            }
            case 'pong': break
            default: {
                console.log('Unhandled message', data);
                break
            }
        }
    }, [])
    const onSocketOpen = useCallback((ws: WebSocket) => {
        dispatch({ type: 'set-loading', loading: true });
        dispatch({ type: 'set-loaded', loaded: false });
        if (state.token) {
            send({
                type: 'auth', data: {
                    token: state.token,
                    deviceId,
                    deviceName: localStorage.getItem('device-name') || undefined
                }
            });
        } else if (state.credentials) {
            send({
                type: 'auth',
                data: {
                    username: state.credentials.username,
                    password: state.credentials.password,
                    deviceId,
                    deviceName: localStorage.getItem('device-name') || undefined,
                    register: true
                }
            });
        } else {
            dispatch({ type: 'set-loading', loading: false });
            dispatch({ type: 'set-loaded', loaded: false });
        }
    }, [state.token, state.credentials])
    const onSocketClose = useCallback((ws: WebSocket) => {
        dispatch({ type: 'set-loading', loading: false });
        dispatch({ type: 'set-loaded', loaded: false });
        dispatch({ type: 'set-credentials', credentials: null });
        dispatch({ type: 'set-peers', peers: [] })
    }, [])
    const ws = useWS(wsUrl, onSocketMessage, onSocketOpen, onSocketClose, !Boolean(state.token));
    const { send, setAuthorized, authorized, close, open, ws: socket } = ws
    const setDeviceName = useCallback((name: string) => {
        dispatch({type: 'set-name', value: name})
        send({type: 'name-change', data: name})
    }, [send])
    return (
        <SocketContext.Provider value={{send, setAuthorized, authorized, close, open, ws: socket, setDeviceName }}>
            {children}
        </SocketContext.Provider>
    );
};

export function useSocket() {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
}

export default SocketContext;