import React, { JSX, Suspense, useCallback, useMemo, useRef } from 'react'
import LoadingPage from '../components/LoadingPage'
import PopupComponent from '../components/Popup'

const ConfirmPopup = React.lazy(() => import('../components/ConfirmPopup'))
const AlertPopup = React.lazy(() => import('../components/AlertPopup'))
const SavedFilesPopup = React.lazy(() => import('../components/SavedFilesPopup'))
const SettingsPopup = React.lazy(() => import('../components/SettingsPopup'))
const SelectSavedFile = React.lazy(() => import('../components/SelectSavedFile'))
const FileInfoPopup = React.lazy(() => import('../components/FileInfoPopup'))
const SharePopup = React.lazy(() => import('../components/SharePopup'))

export default function usePopups() {
    const [popups, setPopups] = React.useState<({ popup: React.ReactElement, onClose?: () => void, showClose: boolean })[]>([])
    const currentPops = useRef<Map<React.ReactElement, string>>(new Map())
    const removePopup = useCallback((all?: boolean) => {
        setPopups((popups) => {
            if (all) {
                currentPops.current.clear()
                return []
            } else {
                currentPops.current.delete(popups[0]?.popup)
                return popups.slice(1)
            }
        })
    }, [])
    const addPopup = useCallback((popup: string, options?: any) => {
        let element: React.ReactElement | null = null
        let onClose: undefined | (() => void) = undefined
        let showClose = false
        switch (popup) {
            case 'confirm': {
                element = <ConfirmPopup message={options.message} onConfirm={(confirmed: boolean) => {
                    removePopup()
                    options.callback(confirmed)
                }} />
                break
            }
            case 'alert': {
                element = <AlertPopup message={options.message} />
                showClose = true
                break
            }
            case 'saved-files': {
                element = <SavedFilesPopup />
                showClose = true
                break
            }
            case 'settings': {
                element = <SettingsPopup />
                showClose = true
                break
            }
            case 'share': {
                element = <SharePopup onDone={() => removePopup()} />
                showClose = true
                break
            }
            case 'select-saved-file': {
                element = <SelectSavedFile onSelect={(file: any) => {
                    if (options && typeof options.onSelect === 'function') {
                        setTimeout(() => options.onSelect(file), 0)
                    }
                }} />
                showClose = true
                break
            }
            case 'file-info': {
                element = <FileInfoPopup file={options?.file} />
                showClose = true
                break
            }
            default: {
                console.error('Unknown popup: ' + popup)
                break
            }
        }
        if (element) {
            currentPops.current.set(element, popup)
            setPopups((popups) => {
                return [{ popup: element, showClose, onClose }, ...popups]
            })
        }
    }, [removePopup])
    const currentPopup: string | null = useMemo(() => currentPops.current.get(popups[0]?.popup) || null, [popups])
    const Popup = useMemo(() => {
        const PopupContent = popups.length > 0 ? popups[0] : null
        if (!PopupContent) return null
        const { onClose, showClose, popup } = PopupContent
        const isSavedFiles = currentPopup === 'saved-files'
        return <PopupComponent
          contentClassName={undefined}
          topPadClassName={isSavedFiles ? 'pt-0' : undefined}
          closeLeftFixed={false}
          closeRightFixed={false}
          closeRightAbsolute={isSavedFiles}
          closeOnRoot={false}
          removePopup={onClose || showClose ? () => {
            if (typeof onClose === 'function') onClose()
            removePopup()
        } : undefined}>
            <Suspense fallback={<LoadingPage />}>
                {popup}
            </Suspense>
        </PopupComponent>
    }, [popups, currentPopup, removePopup])
    return { addPopup, removePopup, Popup, currentPopup }
}
