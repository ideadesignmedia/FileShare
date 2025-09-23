import React, { useCallback, useEffect, useState } from 'react'
import { DownloadMetadata, listAllDownloadMetadata, clearCompletedDownloads } from '../utils/indexed-db'
import { emitter } from '../context/AppContext'

export default function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadMetadata[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [speeds, setSpeeds] = useState<Record<string, number>>({})
  const reload = useCallback(() => {
    setLoading(true)
    listAllDownloadMetadata().then(d => setDownloads(d)).catch(() => setDownloads([])).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    reload()
    const events = ['download-start', 'download-progress', 'download-complete', 'download-cancelled']
    const handler = () => reload()
    const speedHandler = ({ fileId, bps }: any) => {
      setSpeeds(prev => ({ ...prev, [fileId]: bps }))
    }
    events.forEach(evt => emitter.on(evt, handler))
    emitter.on('download-speed', speedHandler)
    return () => {
      events.forEach(evt => emitter.off(evt, handler))
      emitter.off('download-speed', speedHandler)
    }
  }, [reload])
  const clearCompleted = useCallback(async () => {
    await clearCompletedDownloads()
    reload()
  }, [reload])
  return { downloads, loading, reload, clearCompleted, speeds }
}
