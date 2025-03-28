import React, { useCallback, useMemo } from 'react'
import Select, { SelectOptions } from './Select'
import { useP2PContext } from '../context/P2PContext'
import { useAppContext } from '../context/AppContext'

export default React.memo(function PeerSelector() {
    const {state} = useAppContext()
    const { availablePeers, connectedPeers, selectedPeer, setSelectedPeer, createPeerConnection } = useP2PContext()
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
        if (!connectedPeers.includes(option)) createPeerConnection(option, true)
    }, [connectedPeers])
    return <div className="flex flex-wrap items-center justify-items-start">
        <span>Connected to:</span>
        <Select options={dropDownOptions} value={selectedPeer} onChange={onOptionSelect} defaultValue={{ content: <span>Select Peer</span> }} />
    </div>
})