import React from 'react'
import Button from './components/Button'
import { useP2PContext } from './context/P2PContext'
import Peer from './components/Peer'
import Header from './components/Header'
import { useAppContext } from './context/AppContext'


export default function Home() {
    const { state } = useAppContext()
    const { createPeerConnection, availablePeers, connectedPeers, selectedPeer, setSelectedPeer } = useP2PContext()

    return <div className="flex flex-col w-full items-center justify-start relative min-h-full">
        <Header />
        <div className="flex flex-col w-full grow items-center justify-center p-2">
            {(!selectedPeer || !connectedPeers.includes(selectedPeer)) && <div className="w-full flex flex-col gap-2 items-center justify-center">
                <h4>Available Peers</h4>
                {availablePeers.length ? availablePeers.map((peer) => {
                    return <div key={peer} className='flex flex-col gap-1 items-center justify-center bg-gray-800 px-4 py-2 rounded-2xl shadow min-w-40 border-2 border-blue-600'>
                        <h6 className="text-white">{state.peers.find(peerD => peerD.deviceId === peer)?.deviceName || peer}</h6>
                        <Button size="sm" className="border-blue-500 bg-black! text-white!" onClick={() => {
                            createPeerConnection(peer, true)
                            setSelectedPeer(peer)
                        }}>Connect</Button>
                    </div>
                }) : <span>No peers available</span>}
            </div>}
            {connectedPeers.length > 0 && <div className="w-full grow flex flex-col gap-2 items-center justify-center">
                {connectedPeers.map((peer) => (<Peer key={peer} peer={peer} />))}
            </div>}
        </div>
    </div>
}