import React, { useCallback, useEffect, useState } from 'react'
import { useSocket } from '../context/SocketContext'
import { useAppContext } from '../context/AppContext'
import Button from './Button'

export default React.memo(function DeviceName() {
    const { state } = useAppContext()
    const { setDeviceName } = useSocket()
    const [changing, setChanging] = useState(false)
    const [input, setInput] = useState('')
    const changeName = useCallback((name: string) => {
        setDeviceName(name)
        setChanging(false)
    }, [setDeviceName])
    useEffect(() => {
        setInput(state.deviceName)
    }, [state.deviceName])
    if (!changing) return <div className="cursor-pointer flex gap-2 items-center justify-center" onClick={() => setChanging(true)}><span className='text-sm text-slate-600'>Device Name</span> <h5 className='text-slate-900'>{state.deviceName || localStorage.getItem('deviceName') || localStorage.getItem('device-id')}</h5> <Button size="sm" variant="outline">Change</Button></div>
    return <div className="flex gap-2 items-center justify-center">
        <input className='w-48 px-2 py-1 rounded border border-slate-300 text-slate-900' type="text" value={input} onChange={e => {
            setInput(e.target.value)
        }} onKeyDown={(e) => {
            if (e.key === 'Enter') {
                changeName(input)
            }
        }} />
        <Button size="sm" variant='secondary' onClick={() => { changeName(input) }}>Set</Button>
    </div>
})
