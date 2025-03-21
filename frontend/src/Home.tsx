import React from 'react'
import Button from './components/Button'
import { useP2PContext } from './context/P2PContext'
import Peer from './components/Peer'
import Header from './components/Header'


export default function Home() {

    const { createPeerConnection, availablePeers, connectedPeers } = useP2PContext()

    return <div className="flex flex-col w-full items-center justify-start relative min-h-full">
        <Header/>
        <div className="w-full flex flex-col gap-2 items-center justify-center">
            <h4>Available Peers</h4>
            {availablePeers.length ? availablePeers.map((peer) => {
                return <div key={peer} className='flex gap-2 items-center justify-center'>
                    <p>{peer}</p>
                    <Button variant='outline' onClick={() => {
                        createPeerConnection(peer, true)
                        
                    }}>Connect</Button>
                </div>
            }) : <span>No peers available</span>}
        </div>
        <div className="w-full flex flex-col gap-2 items-center justify-center">
            <h4>Connected Peers</h4>
            {connectedPeers.length ? connectedPeers.map((peer) => <Peer key={peer} peer={peer}/>) : <span>No peers connected</span>}
        </div>
    </div>
}