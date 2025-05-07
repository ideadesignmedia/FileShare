import React from 'react'
import Toggle from './Toggle'
import { useP2PContext } from '../context/P2PContext'



export default React.memo(() => {
    const {setAutoDownloadFiles, autoDownloadFiles} = useP2PContext()
    return <Toggle enabled={autoDownloadFiles} onToggle={() => {
        setAutoDownloadFiles(a => !a)
    }} label={'Auto Download'} />
})