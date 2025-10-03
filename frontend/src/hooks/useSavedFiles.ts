import React, { useCallback, useEffect, useState } from 'react'
import { FileMetadata, listAllFileMetadata } from '../utils/indexed-db'
import { emitter } from '../context/AppContext'

export const useSavedFiles = () => {
    const [savedFiles, setSavedFiles] = useState<FileMetadata[]>([])
    const [reloadFiles, setReloadFiles] = useState<number>(0)
    const [gettingFiles, setGettingFiles] = useState<boolean>(false)
    const reload = useCallback(() =>{
         setReloadFiles(a => a + 1)
        }, [])
    const getFiles = useCallback(() => {
        return listAllFileMetadata().then(files => {
            setSavedFiles(files.filter(f => !(f as any).temp))
        }).catch(e => {
            console.error(e)
            setSavedFiles([])
        })
    }, [])
    useEffect(() => {
        if (gettingFiles) return
        setGettingFiles(true)
        getFiles().finally(() => setGettingFiles(false))
    }, [getFiles, reloadFiles])
    useEffect(() => {
        emitter.on('file-downloaded', reload)
        emitter.on('file-saved', reload)
        emitter.on('file-deleted', reload)
        return () => {
            emitter.off('file-downloaded', reload)
            emitter.off('file-saved', reload)
            emitter.off('file-deleted', reload)
        }
    })
    return { reload, loading: gettingFiles, files: savedFiles }
}

export default useSavedFiles
