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
    if (!changing) return <div className="text-white cursor-pointer flex gap-1 items-center justify-center" onClick={() => setChanging(true)}><h5 className='underline'>Device Name:</h5> <h5>{state.deviceName}</h5> <Button size="sm" variant="outline">Change</Button></div>
    return <div className="flex gap-1 items-center justify-center">
        <input type="text" value={input} onChange={e => {
            setInput(e.target.value)
        }} onKeyDown={(e) => {
            if (e.key === 'Enter') {
                changeName(input)
            }
        }} />
        <Button size="sm" variant='secondary' onClick={() => { changeName(input) }}>Set</Button>
    </div>
})