import React, { JSX, Suspense, useCallback, useMemo, useRef } from 'react'
import LoadingPage from '../components/LoadingPage'
import PopupComponent from '../components/Popup'

const ConfirmPopup = React.lazy(() => import('../components/ConfirmPopup'))
const AlertPopup = React.lazy(() => import('../components/AlertPopup'))
const SavedFilesPopup = React.lazy(() => import('../components/SavedFilesPopup'))

export default function usePopups() {
    const [popups, setPopups] = React.useState<({ popup: JSX.Element, onClose?: () => void, showClose: boolean })[]>([])
    const currentPops = useRef<Map<JSX.Element, string>>(new Map())
    const removePopup = useCallback((all?: boolean) => {
        setPopups((popups) => {
            if (!all) {
                currentPops.current.delete(popups[0]?.popup)
            }
            return all ? [] : popups.slice(1)
        })
    }, [])
    const addPopup = useCallback((popup: string, options?: any) => {
        let element: JSX.Element | null = null
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
        return <PopupComponent removePopup={onClose || showClose ? () => {
            if (typeof onClose === 'function') onClose()
            removePopup()
        } : undefined}>
            <Suspense fallback={<LoadingPage />}>
                {popup}
            </Suspense>
        </PopupComponent>
    }, [popups])
    return { addPopup, removePopup, Popup, currentPopup }
}