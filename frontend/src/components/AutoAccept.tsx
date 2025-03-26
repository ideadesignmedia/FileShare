import React from 'react'
import Toggle from './Toggle'
import { useP2PContext } from '../context/P2PContext'



export default React.memo(() => {
    const {setAutoAcceptFiles, autoAcceptFiles} = useP2PContext()
    return <Toggle enabled={autoAcceptFiles} onToggle={() => {
        setAutoAcceptFiles(a => !a)
    }} label={'Auto Accept'} />
})