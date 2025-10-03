import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from './components/Button'
import icons from './components/icons'
import { fileKindFrom } from './utils/file-kind'
import { emitter } from './context/AppContext'
import { useSocket } from './context/SocketContext'
import { rtcOptions, wsUrl } from './constants'
import { useAppContext } from './context/AppContext'
import { extensionFromMime } from './utils/mime'

type ShareRoute = {
  mode: 'share' | 'receive'
  token: string
}

const parseRoute = (): ShareRoute | null => {
  const match = (s: string) => s.toLowerCase().match(/\/(share|receive|recieve)\/([^\/?#]+)/)
  const m1 = match(window.location.pathname)
  if (m1) return { mode: (m1[1] === 'recieve' ? 'receive' : (m1[1] as any)), token: m1[2] }
  const m2 = match(window.location.hash)
  if (m2) return { mode: (m2[1] === 'recieve' ? 'receive' : (m2[1] as any)), token: m2[2] }
  return null
}

export default function SharePage() {
  const [route, setRoute] = useState<ShareRoute | null>(parseRoute())
  const { confirm } = useAppContext()
  useEffect(() => {
    const onChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [])
  const [meta, setMeta] = useState<{ name: string; size: number; type: string }[]>([])
  const [status, setStatus] = useState('')
  const [connectedCount, setConnectedCount] = useState(0)
  const [guestConnected, setGuestConnected] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<{ sent?: number; total?: number; receiving?: number } | null>(null)
  const [sendProg, setSendProg] = useState<{ name: string; sent: number; size: number }[]>([])
  const [received, setReceived] = useState<{ name: string; type: string; url: string; size: number }[]>([])
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const stopRef = useRef<() => void>(() => {})
  const offerSentRef = useRef(false)
  const receivedRef = useRef<{ url: string }[]>([])
  const token = route?.token || ''
  const tokenValue = React.useMemo(() => (route?.token || (window.location.pathname.match(/\/(share|receive)\/([^\/?#]+)/i)?.[2] || window.location.hash.match(/\/(share|receive)\/([^\/?#]+)/i)?.[2] || '')), [route])
  const receiveUrl = React.useMemo(() => {
    if (!tokenValue) return ''
    const segs = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    const lower = segs.map(s => s.toLowerCase())
    const i = lower.findIndex(s => s === 'share' || s === 'receive' || s === 'recieve')
    const baseSegs = i > 0 ? segs.slice(0, i) : []
    const basePath = '/' + (baseSegs.length ? baseSegs.join('/') + '/' : '')
    return `${window.location.origin}${basePath}?mode=receive&t=${encodeURIComponent(tokenValue)}`
  }, [tokenValue])
  const [qrUrl, setQrUrl] = useState('')
  const { send } = useSocket()

  const bytesToSize = useCallback((bytes: number) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B','KB','MB','GB','TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }, [])

  const ensureExtName = useCallback((name: string, type: string) => {
    if (name && name.includes('.')) return name
    const ext = extensionFromMime(type) || ''
    return ext ? `${name}.${ext}` : name
  }, [])

  useEffect(() => {
    if (!route) return
    if (route.mode === 'share') {
      const raw = sessionStorage.getItem(`share-files:${route.token}`)
      if (raw) {
        try { setMeta(JSON.parse(raw)) } catch { setMeta([]) }
      }
    }
  }, [route])

  useEffect(() => {
    if (!route || route.mode !== 'share' || !receiveUrl) return
    const requestId = 'qr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const onQr = (d: any) => {
      if (d?.dataUrl) setQrUrl(d.dataUrl)
      emitter.off('qr:' + requestId, onQr)
    }
    emitter.on('qr:' + requestId, onQr)
    try { send({ type: 'qr-create', data: { requestId, text: receiveUrl } } as any) } catch { emitter.off('qr:' + requestId, onQr) }
    return () => emitter.off('qr:' + requestId, onQr)
  }, [route, receiveUrl, send])

  useEffect(() => () => {
    if (pcRef.current) try { pcRef.current.close() } catch {}
    if (dcRef.current) try { dcRef.current.close() } catch {}
    if (stopRef.current) stopRef.current()
    try { receivedRef.current.forEach(f => URL.revokeObjectURL(f.url)) } catch {}
  }, [])

  useEffect(() => { receivedRef.current = received }, [received])

  const setupSender = useCallback(async () => {
    if (!token) return
    const pc = new RTCPeerConnection(rtcOptions)
    pcRef.current = pc
    const dc = pc.createDataChannel('share', { ordered: true })
    dcRef.current = dc
    setStatus('Waiting for receiver...')
    try { console.log('[Share][Sender] setupSender start', { token }) } catch {}

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        try { console.log('[Share][Sender] ICE candidate', e.candidate) } catch {}
        send({ type: 'share-signal', data: { token, payload: { type: 'candidate', candidate: e.candidate } } } as any)
      }
    }
    pc.onconnectionstatechange = () => { try { console.log('[Share][Sender] pc state', pc.connectionState) } catch {} }
    pc.onsignalingstatechange = () => { try { console.log('[Share][Sender] signaling', pc.signalingState) } catch {} }
    const clean = () => {
      try { dc.close() } catch {}
      try { pc.close() } catch {}
      dcRef.current = null
      pcRef.current = null
    }
    stopRef.current = clean

    const startOffer = async () => {
      if (offerSentRef.current) return
      offerSentRef.current = true
      try {
        console.log('[Share][Sender] Creating offer')
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        console.log('[Share][Sender] Offer setLocalDescription OK, sending')
        send({ type: 'share-signal', data: { token, payload: { type: 'offer', sdp: offer } } } as any)
      } catch (err) { try { console.log('[Share][Sender] Offer error', err) } catch {} }
    }
    const handler = async (msg: any) => {
      if (msg?.type === 'share-guest-connected') {
        setConnectedCount(c => (c ? c : 0) + 1)
        setGuestConnected(true)
        setStatus('Receiver requested. Click Accept to start sending.')
      } else if (msg?.type === 'share-signal') {
        const { payload } = msg.data || {}
        if (payload?.type === 'answer') {
          try { console.log('[Share][Sender] Got answer, applying') } catch {}
          await pc.setRemoteDescription(payload.sdp)
          try { console.log('[Share][Sender] Answer applied') } catch {}
        } else if (payload?.type === 'candidate') {
          try { console.log('[Share][Sender] Add ICE from guest') } catch {}
          try { await pc.addIceCandidate(payload.candidate) } catch {}
        }
      } else if (msg?.type === 'share-error') {
        setError(msg.data?.error || 'Share error')
        try { console.log('[Share][Sender] share-error', msg.data) } catch {}
      }
    }
    emitter.on('share:' + token, handler)
    // Ask server whether a guest is already connected; if so, start immediately
    try { send({ type: 'share-status', data: { token } } as any) } catch {}
    const statusHandler = async (msg: any) => {
      if (msg?.type === 'share-status' && msg?.data?.token === token) {
        if (msg.data.guest) {
          setStatus('Receiver available. Click Accept to start sending.')
          setConnectedCount(c => (c ? c : 0) + 1)
        }
        emitter.off('share:' + token, statusHandler)
      }
    }
    emitter.on('share:' + token, statusHandler)

    dc.onopen = async () => {
      try { console.log('[Share][Sender] datachannel open') } catch {}
      setStatus('Sending files...')
      try {
        const { listShareFilesByToken, createIndexedDBChunkStream } = await import('./utils/indexed-db')
        const shareFiles = await listShareFilesByToken(token)
        if (!shareFiles.length) {
          setStatus('No files available to send')
          try { console.log('[Share][Sender] No temp files found for token') } catch {}
          return
        }
        const total = shareFiles.reduce((n, f) => n + (f.size || 0), 0)
        setProgress({ sent: 0, total })
        setSendProg(shareFiles.map(f => ({ name: f.name, sent: 0, size: f.size })))
        const sendJSON = (obj: any) => dc.send(JSON.stringify(obj))
        sendJSON({ t: 'meta', files: shareFiles.map(f => ({ name: f.name, size: f.size, type: f.type })) })
        for (let i = 0; i < shareFiles.length; i++) {
          const f = shareFiles[i]
          try { console.log('[Share][Sender] Start file', f.name, f.type, f.size) } catch {}
          sendJSON({ t: 'file', name: f.name, size: f.size, type: f.type })
          const stream = await createIndexedDBChunkStream(f.fileId)
          const reader = (stream as ReadableStream<any>).getReader()
          for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            if (value && value.chunkData) {
              const chunk = value.chunkData as Uint8Array
              dc.send(chunk)
              setProgress(p => ({ sent: (p?.sent || 0) + chunk.byteLength, total }))
              setSendProg(p => { const a = [...p]; a[i] = { ...a[i], sent: a[i].sent + chunk.byteLength }; return a })
            }
          }
          sendJSON({ t: 'file-end' })
          try { console.log('[Share][Sender] File end', f.name) } catch {}
        }
        sendJSON({ t: 'done' })
        try { console.log('[Share][Sender] Done sending') } catch {}
        setStatus('Completed')
      } catch (err) {
        console.error('[Share][Sender] Error sending from IDB', err)
        setStatus('Error while sending')
      }
    }

    dc.onclose = () => {
      setStatus('Channel closed')
      try { console.log('[Share][Sender] datachannel closed') } catch {}
    }
  }, [meta, send, token])

  const senderStartedRef = useRef(false)
  useEffect(() => {
    if (route?.mode === 'share' && token && !senderStartedRef.current) {
      try { console.log('[Share][Sender] calling setupSender', { token, route }) } catch {}
      senderStartedRef.current = true
      setupSender()
    }
  }, [route, token, setupSender])

  const [passcode, setPasscode] = useState('')
  const guestWSRef = useRef<WebSocket | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [allowReceive, setAllowReceive] = useState(false)
  const [recvProg, setRecvProg] = useState<{ name: string; received: number; size: number }[]>([])

  const setupGuest = useCallback(() => {
    if (!token) return
    setConnecting(true)
    const ws = new WebSocket(wsUrl)
    guestWSRef.current = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'share-guest-join', data: { token, passcode: passcode.trim() } }))
    }
    ws.onmessage = async (evt) => {
      let msg: any
      try { msg = JSON.parse(evt.data) } catch { msg = null }
      if (!msg) return
      if (msg.type === 'share-error') {
        setError(msg.data?.error || 'Error')
        setConnecting(false)
      } else if (msg.type === 'share-guest-accepted') {
        setError('')
        setAllowReceive(true)
        setMeta((msg.data?.meta?.files || []) as any)
        setRecvProg([])
        setStatus('Request sent. Waiting for sender to accept...')
      } else if (msg.type === 'share-signal') {
        const payload = msg.data?.payload
        if (!pcRef.current) {
          const pc = new RTCPeerConnection(rtcOptions)
          pcRef.current = pc
          pc.onicecandidate = (e) => {
            if (e.candidate) ws.send(JSON.stringify({ type: 'share-signal', data: { token, payload: { type: 'candidate', candidate: e.candidate } } }))
          }
          pc.ondatachannel = (e) => {
            const dc = e.channel
            dcRef.current = dc
            const chunks: Uint8Array[] = []
            let current: { name: string; size: number; type: string } | null = null
            dc.onmessage = (m) => {
              if (typeof m.data === 'string') {
                const obj = JSON.parse(m.data)
                if (obj.t === 'meta') {
                  setMeta(obj.files || [])
                  setProgress({ receiving: 0, total: (obj.files || []).reduce((n: number, f: any) => n + (f.size || 0), 0) })
                  setRecvProg([])
                  setStatus('Receiving files...')
                } else if (obj.t === 'file') {
                  current = { name: obj.name, size: obj.size, type: obj.type }
                  chunks.length = 0
                  setRecvProg(p => [...p, { name: obj.name, received: 0, size: obj.size }])
                } else if (obj.t === 'file-end') {
                  if (current) {
                    const snap = current
                    const blob = new Blob(chunks, { type: snap.type || 'application/octet-stream' })
                    const url = URL.createObjectURL(blob)
                    setReceived(r => [...r, { name: ensureExtName(snap.name, snap.type), type: snap.type, url, size: snap.size }])
                    current = null
                  } else {
                    try { console.warn('[Share][Guest] file-end received without current file') } catch {}
                  }
                } else if (obj.t === 'done') {
                  setStatus('Completed')
                  try { ws.close() } catch {}
                }
              } else if (m.data instanceof ArrayBuffer) {
                const u = new Uint8Array(m.data)
                chunks.push(u)
                setProgress(p => ({ receiving: (p?.receiving || 0) + u.byteLength, total: p?.total }))
                setRecvProg(p => { if (!p.length) return p; const a = [...p]; a[a.length - 1] = { ...a[a.length - 1], received: a[a.length - 1].received + u.byteLength }; return a })
              } else if (m.data && m.data.arrayBuffer) {
                m.data.arrayBuffer().then((ab: ArrayBuffer) => {
                  const u = new Uint8Array(ab)
                  chunks.push(u)
                  setProgress(p => ({ receiving: (p?.receiving || 0) + u.byteLength, total: p?.total }))
                  setRecvProg(p => { if (!p.length) return p; const a = [...p]; a[a.length - 1] = { ...a[a.length - 1], received: a[a.length - 1].received + u.byteLength }; return a })
                })
              }
            }
          }
        }
        if (payload?.type === 'offer') {
          await pcRef.current!.setRemoteDescription(payload.sdp)
          const answer = await pcRef.current!.createAnswer()
          await pcRef.current!.setLocalDescription(answer)
          ws.send(JSON.stringify({ type: 'share-signal', data: { token, payload: { type: 'answer', sdp: answer } } }))
        } else if (payload?.type === 'candidate') {
          try { await pcRef.current!.addIceCandidate(payload.candidate) } catch {}
        }
      }
    }
    ws.onclose = () => {
      setConnecting(false)
    }
  }, [passcode, token])

  if (!route) {
    return (
      <div className="min-h-screen flex items-center justify-center p-3 bg-blue-800 text-white">
        <div className="bg-white text-slate-900 border border-slate-200 rounded-xl p-4 shadow-sm w-full max-w-xl">
          <h3>Invalid Share Link</h3>
          <p className="text-slate-700 mt-1">The link is not recognized.</p>
          <div className="mt-3">
            <Button onClick={() => { if (window.location.pathname !== '/') { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) } }}>Go Home</Button>
          </div>
        </div>
      </div>
    )
  }

  if (route.mode === 'receive') {
    return (
      <div className="min-h-screen flex items-center justify-center p-3 bg-blue-800 text-white">
        <div className="bg-white text-slate-900 border border-slate-200 rounded-xl p-4 shadow-sm w-full max-w-xl">
          <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">Receive Files</div>
          <h3 className="mb-2">Enter Passcode to Continue</h3>
          <p className="text-sm text-slate-700 mb-3">FileShare lets you send files directly and securely. Transfers go device‑to‑device and are not stored on our servers.</p>
          {!allowReceive && (
            <div className="space-y-2">
              {error && <div className="text-red-600 text-sm">{error}</div>}
              <label className="text-sm text-slate-700">Passcode
                <input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 text-slate-900" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Enter passcode" />
              </label>
              <div className="mt-2">
                <Button className="w-full" disabled={!passcode.trim() || connecting} onClick={() => { setError(''); setupGuest() }}>
                  <span className="inline-flex items-center gap-2 justify-center w-full">
                    <span>{connecting ? 'Connecting…' : 'Connect'}</span>
                    {icons.send}
                  </span>
                </Button>
              </div>
              <div className="mt-2 text-center">
                <Button variant="light" onClick={() => { if (window.location.pathname !== '/') { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) } }}>Home</Button>
              </div>
            </div>
          )}
          {allowReceive && (
            <div>
              <div className="text-sm text-slate-700 mb-2">Request sent. Waiting for sender to accept…</div>
              {meta.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Files</div>
                  <ul className="max-h-40 overflow-auto divide-y divide-slate-100">
                    {meta.map((m, i) => {
                      const kind = fileKindFrom(m.type, m.name)
                      return (
                        <li key={`${m.name}-${i}`} className="py-2 text-sm text-slate-900" title={m.name}>
                          <div className="flex items-center gap-3">
                            <span className="text-blue-600 flex-none">{(icons as any)[kind]}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{m.name}</div>
                              <div className="text-xs text-slate-600 truncate">{m.type || 'application/octet-stream'} • {bytesToSize(m.size)}</div>
                            </div>
                            {recvProg[i] ? (
                              <span className="text-xs text-slate-600 shrink-0">{bytesToSize(recvProg[i].received || 0)} / {bytesToSize(recvProg[i].size || 0)}</span>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              {progress && (
                <div className="mt-2 text-sm text-slate-700">Received {Math.round((progress.receiving || 0) / 1024)} KB</div>
              )}
              {received.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Downloads</div>
                  <ul className="space-y-1">
                    {received.map((f, i) => {
                      const dlName = ensureExtName(f.name, f.type)
                      return (
                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                          <span className="truncate text-slate-900" title={dlName}>{dlName}</span>
                          <a className="text-blue-700 hover:underline shrink-0" href={f.url} download={dlName}>Save</a>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
              <div className="mt-3 text-center">
                <Button variant="light" onClick={() => { if (window.location.pathname !== '/') { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) } }}>Home</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-3 bg-blue-800 text-white">
      <div className="bg-white text-slate-900 border border-slate-200 rounded-xl p-4 shadow-sm w-full max-w-xl">
        <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">Share Files</div>
        <h3 className="mb-2">Share this link or QR code</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
          <div className="flex items-center justify-center">
            {qrUrl ? (
              <img src={qrUrl || undefined} alt="Share QR" className="w-48 h-48 border border-slate-200 rounded-lg bg-white" />
            ) : (
              <div className="w-48 h-48 border border-slate-200 rounded-lg bg-white flex items-center justify-center text-slate-500 text-sm">Generating…</div>
            )}
          </div>
          <div>
            <div className="text-sm text-slate-700 mb-2">Anyone with this link can open the receive page.</div>
            <div className="flex items-center gap-2">
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900" readOnly value={receiveUrl} />
              <Button onClick={() => { try { const p = navigator.clipboard?.writeText(receiveUrl); if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {}) } catch {} }}>Copy</Button>
            </div>
            {meta.length > 0 && (
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Files</div>
                <ul className="max-h-36 overflow-auto divide-y divide-slate-100">
                  {meta.map((m, i) => {
                    const kind = fileKindFrom(m.type, m.name)
                    return (
                      <li key={`${m.name}-${i}`} className="py-2 text-sm text-slate-900" title={m.name}>
                        <div className="flex items-center gap-3">
                          <span className="text-blue-600 flex-none">{(icons as any)[kind]}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{m.name}</div>
                            <div className="text-xs text-slate-600 truncate">{m.type || 'application/octet-stream'} • {bytesToSize(m.size)}</div>
                          </div>
                          {sendProg[i] ? (
                            <span className="text-xs text-slate-600 shrink-0">{bytesToSize(sendProg[i].sent || 0)} / {bytesToSize(sendProg[i].size || 0)}</span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            <div className="mt-3 text-sm text-slate-700">{status} {connectedCount > 0 ? `(Connected: ${connectedCount})` : ''}</div>
            {guestConnected && !offerSentRef.current && (
              <div className="mt-2">
                <Button onClick={async () => {
                  try { console.log('[Share][Sender] Accept clicked') } catch {}
                  setStatus('Connecting…')
                  offerSentRef.current = true
                  if (!pcRef.current) {
                    try { console.log('[Share][Sender] No pcRef.current; initializing sender PC now') } catch {}
                    try { await setupSender() } catch {}
                  }
                  const pc = pcRef.current
                  try { console.log('[Share][Sender] pc exists?', !!pc) } catch {}
                  if (!pc) return
                  try {
                    const offer = await pc.createOffer()
                    try { console.log('[Share][Sender] Offer created') } catch {}
                    await pc.setLocalDescription(offer)
                    try { console.log('[Share][Sender] Local description set; sending offer') } catch {}
                    send({ type: 'share-signal', data: { token, payload: { type: 'offer', sdp: offer } } } as any)
                  } catch (err) {
                    try { console.log('[Share][Sender] Accept error', err) } catch {}
                  }
                }}>Accept</Button>
              </div>
            )}
            {progress && progress.total ? (
              <div className="mt-1 text-sm text-slate-600">{Math.round((progress.sent || 0) / 1024)} KB / {Math.round((progress.total || 0) / 1024)} KB</div>
            ) : null}
            {/* Cancel removed; users can finish via Done confirmation below */}
          </div>
        </div>
        <div className="mt-3">
          <Button className="w-full" onClick={async () => {
            confirm('Done sharing? This will end the share session.', (ok) => {
              if (!ok) return
              try { send({ type: 'share-close', data: { token } } as any) } catch {}
              if (stopRef.current) stopRef.current()
              // cleanup temp share files
              import('./utils/indexed-db').then(m => m.deleteTempFilesByShareToken(token)).catch(() => {})
              if (window.location.pathname !== '/') {
                window.history.pushState({}, '', '/')
                window.dispatchEvent(new PopStateEvent('popstate'))
              }
            })
          }}>
            <span className="inline-flex items-center gap-2 justify-center w-full"><span>Done</span>{icons.check}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
