import React from 'react'
import Toggle from './Toggle'
import { useP2PContext } from '../context/P2PContext'

export default React.memo(() => {
  const { autoDownloadFiles } = useP2PContext() as any
  const { autoResume, setAutoResume } = (useP2PContext() as any)
  return <Toggle enabled={!!autoResume} onToggle={() => setAutoResume((a: boolean) => !a)} label={'Auto Resume'} />
})
