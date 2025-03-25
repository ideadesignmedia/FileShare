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
    if (!changing) return <span onClick={() => setChanging(true)}>{state.deviceName}</span>
    return <div className="flex gap-1 items-center justify-center">
        <input type="text" value={input} onChange={e => {
            setInput(e.target.value)
        }} onKeyDown={(e) => {
            if (e.key === 'Enter') {
                changeName(input)
            }
        }} />
        <Button onClick={() => { changeName(input) }}>Change</Button>
    </div>
})