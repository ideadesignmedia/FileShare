import React from 'react'
import Button from './Button'
import { useSocket } from '../context/SocketContext'
import { useAppContext } from '../context/AppContext'


export default React.memo(function LogOut() {
  const { dispatch, removePopup } = useAppContext()
  const { send, close } = useSocket()
  return (
    <Button
      size="sm"
      variant="danger"
      className="flex-1 sm:flex-none w-full sm:w-auto"
      onClick={() => {
        removePopup(true)
        send({ type: 'logout' })
        localStorage.removeItem('token')
        dispatch({ type: 'set-credentials', credentials: null })
        dispatch({ type: 'set-token', token: '' })
        dispatch({ type: 'set-peers', peers: [] })
        dispatch({ type: 'set-loaded', loaded: false })
        dispatch({ type: 'set-loading', loading: false })
        close()
      }}
    >
      Log Out
    </Button>
  )
})
