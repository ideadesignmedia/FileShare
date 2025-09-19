import React from 'react'
import Button from './components/Button'
import { useP2PContext } from './context/P2PContext'
import Peer from './components/Peer'
import Header from './components/Header'
import { useAppContext } from './context/AppContext'


export default function Home() {
    const { state } = useAppContext()
    const { createPeerConnection, availablePeers, connectedPeers, selectedPeer, setSelectedPeer, disconnectPeerConnection } = useP2PContext()

    const availableNotConnected = availablePeers.filter(p => !connectedPeers.includes(p))
    const currentPeer = selectedPeer && connectedPeers.includes(selectedPeer) ? selectedPeer : (connectedPeers[0] || '')
    return <div className="flex flex-col w-full items-center justify-start relative min-h-full">
        <Header />
        <main className="w-full grow">
            <div className="mx-auto w-full max-w-6xl p-3 flex flex-col md:flex-row gap-4">
                <aside className="md:w-72 w-full shrink-0">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                        <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">Connections</div>
                        <div className="space-y-2">
                            {connectedPeers.length ? (
                                <div>
                                    <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Connected</div>
                                    <ul className="space-y-1">
                                        {connectedPeers.map(peer => {
                                            const name = state.peers.find(p => p.deviceId === peer)?.deviceName || peer
                                            const isActive = currentPeer === peer
                                            return (
                                                <li key={peer} className={`flex items-center justify-between gap-2 px-2 py-2 rounded transition-colors ${isActive ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50 hover:ring-1 hover:ring-blue-200'} cursor-pointer`} onClick={() => setSelectedPeer(peer)}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="inline-block w-2 aspect-square rounded-full bg-green-500 flex-none" />
                                                        <span className="truncate">{name}</span>
                                                    </div>
                                                    <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); disconnectPeerConnection(peer) }}>Disconnect</Button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                </div>
                            ) : null}
                            <div>
                                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Available</div>
                                {availableNotConnected.length ? (
                                    <ul className="space-y-1">
                                        {availableNotConnected.map(peer => {
                                            const name = state.peers.find(p => p.deviceId === peer)?.deviceName || peer
                                            return (
                                                <li key={peer} className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-slate-50 hover:ring-1 hover:ring-blue-200 transition-colors cursor-pointer" onClick={() => setSelectedPeer(peer)}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="inline-block w-2 aspect-square rounded-full bg-slate-400 flex-none" />
                                                        <span className="truncate">{name}</span>
                                                    </div>
                                                    <Button size="sm" onClick={(e) => { e.stopPropagation(); createPeerConnection(peer, true); setSelectedPeer(peer) }}>Connect</Button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                ) : (
                                    <div className="text-slate-500 text-sm">No peers found</div>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>
                <section className="flex-1 min-w-0">
                    {currentPeer ? (
                        <Peer key={currentPeer} peer={currentPeer} />
                    ) : (
                        <div className="w-full">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                                <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">Getting Started</div>
                                <h3 className="mb-2">Select or connect to a peer</h3>
                                <p className="text-slate-700 mb-3">Sign in on another device with the same username and password. Use the Connections panel to pick that device and click Connect to start a secure session. Once connected, you can send and receive files right here.</p>
                                <ul className="list-disc list-outside pl-5 text-slate-700 space-y-1">
                                    <li>On another device, sign in with same credentials.</li>
                                    <li>Choose that device under Connections on the left.</li>
                                    <li>Click Connect to establish a session.</li>
                                    <li>Easily send files or folders.</li>
                                    <li>Disconnect at any time.</li>
                                </ul>
                                <div className="mt-3 text-sm text-slate-500">Transfers move directly between your devices. You can disconnect at any time from the Connected Peer panel.</div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </main>
    </div>
}
