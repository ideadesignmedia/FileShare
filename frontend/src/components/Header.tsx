import React, { useCallback, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useSocket } from '../context/SocketContext';
import Button from './Button';
import { useP2PContext } from '../context/P2PContext';
import Select, { SelectOptions } from './Select';

interface HeaderProps {
    title?: string;
}

const Header: React.FC<HeaderProps> = ({ }) => {
    const { dispatch, state } = useAppContext()
    const { send, close } = useSocket()
    const { availablePeers, connectedPeers, selectedPeer, setSelectedPeer } = useP2PContext()
    const dropDownOptions: SelectOptions = useMemo(() => {
        const options =  [...availablePeers, ...connectedPeers].map(peer => {
            const name = state.peers.find(p => p.deviceId === peer)?.deviceName || peer
            return { value: peer, content: <span>{name}</span> }
        })
        if (selectedPeer) options.unshift({ value: '', content: <span>Select Peer</span> })
        return options
    }, [availablePeers, connectedPeers, state.peers, selectedPeer])
    const onOptionSelect = useCallback((option: string) => {
        setSelectedPeer(option)
    }, [])
    return (
        <header className="bg-blue-600
         text-white 
         px-3
         pt-2
         pb-1
         shadow-md 
         w-full
         max-w-full
        flex
         sticky 
         
         top-0
         z-10
         min-h-18
        ">
            <div className="flex 
         items-center 
         flex-wrap 
         justify-between
         w-full
         relative
         max-w-full
         ">

                <div className="flex flex-shrink-0 items-center gap-2">
                    <h3 className="text-xl font-bold">FileShare</h3>
                </div>
                <div className="flex flex-grow items-center justify-end flex-wrap gap-1">
                    <div>
                        <Select options={dropDownOptions} value={selectedPeer} onChange={onOptionSelect} defaultValue={{ content: <span>Select Peer</span> }} />
                    </div>
                    <Button onClick={() => {
                        send({ type: 'logout' })
                        localStorage.removeItem('token')
                        dispatch({ type: 'set-credentials', credentials: null })
                        dispatch({ type: 'set-token', token: '' })
                        dispatch({ type: 'set-peers', peers: [] })
                        dispatch({ type: 'set-loaded', loaded: false })
                        dispatch({ type: 'set-loading', loading: false })
                        close()
                    }}>Log Out</Button>
                </div>
            </div>
        </header>
    );
};

export default Header;