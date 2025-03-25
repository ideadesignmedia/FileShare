import React, { useReducer, createContext, useContext, ReactNode, Dispatch, useEffect } from 'react';
import { SocketProvider } from './SocketContext';
import EventEmitter from '../utils/event-emitter';
import { deviceId } from '../constants';


export const emitter = new EventEmitter();

export function emit(event: string, data: any) {
    emitter.emit(event, data);
}



type Action = {
    type: 'set-loading',
    loading: boolean,
} | {
    loaded: boolean,
    type: 'set-loaded',
} | {
    type: 'set-token',
    token: string,
} | {
    type: 'set-peers',
    peers: Peer[],
} | {
    type: 'connection',
    peer: Peer
} | {
    type: 'disconnection',
    peer: { id: number, deviceId: string }
} | {
    type: 'set-credentials',
    credentials: {
        username: string,
        password: string
    } | null,
} | {
    type: 'set-name',
    value: string
} | {
    type: 'update-name',
    value: {
        deviceId: string,
        deviceName: string
    }
}

export type Peer = {
    deviceId: string,
    deviceName: string
}
interface AppState {
    token: string,
    peers: Peer[],
    loading: boolean,
    loaded: boolean,
    credentials: {
        username: string,
        password: string
    } | null,
    deviceName: string
}
const initialState: AppState = {
    token: localStorage.getItem('token') || '',
    peers: [],
    loading: false,
    loaded: false,
    credentials: null,
    deviceName: localStorage.getItem('deviceName') || ''
}
function appReducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'set-token':
            return { ...state, token: action.token };
        case 'set-peers':
            return { ...state, peers: action.peers };
        case 'set-loading':
            return { ...state, loading: action.loading };
        case 'set-loaded':
            return { ...state, loaded: action.loaded };
        case 'set-credentials':
            return { ...state, credentials: action.credentials };
        case 'connection':
            return { ...state, peers: [...state.peers, action.peer] };
        case 'disconnection':
            return { ...state, peers: state.peers.filter(p => p.deviceId !== action.peer.deviceId) };
        case 'set-name': 
            return {...state, deviceName: action.value}
        case 'update-name':
            return {...state, peers: state.peers.map(peer => {
                if (peer.deviceId === action.value.deviceId) {
                    return {...peer, deviceName: action.value.deviceName}
                } else {
                    return peer
                }
            })}
        default:
            return state;
    }
}

interface AppContextProps {
    state: AppState;
    dispatch: Dispatch<Action>;
    emit: (event: string, data: any) => void;
    confirm: (message: string, callback: (confirmed: boolean) => void) => void;
    alert: (message: string) => void;
    flash: (message: string) => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

interface AppProviderProps {
    children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const confirm = (message: string, callback: (confirmed: boolean) => void) => {
        const confirmed = window.confirm(message);
        callback(confirmed);
    }
    const alert = (message: string) => {
        window.alert(message);
    }
    const flash = (message: string) => {
        window.alert(message)
    }
    useEffect(() => {
        localStorage.setItem('deviceName', state.deviceName)
    }, [state.deviceName])
    return (
        <AppContext.Provider value={{ state, dispatch, emit, confirm, alert, flash }}>
            <SocketProvider>
                {children}
            </SocketProvider>
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};