import React, { Suspense, useState } from 'react'
import { useAppContext } from './context/AppContext'
import { useSocket } from './context/SocketContext'
import { P2PProvider } from './context/P2PContext'
import LoadingPage from './components/LoadingPage'
import Button from './components/Button'

const Home = React.lazy(() => import('./Home'))

function App() {
  const { state, dispatch } = useAppContext()
  const { open } = useSocket()
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  if (!state.loaded) {
    if (state.loading || state.token) {
      return (
        <LoadingPage />
      )
    } else {
      return (
        <div className="flex flex-col grow items-center justify-center gap-3 w-full p-4">
          <h1>Login</h1>
          <p className="">Use any username and password and hit submit to get started.<br/><br/>Use the same username and password on your other devices to connect and share files using a peer to peer connection.</p>
          <form className="flex flex-col items-center justify-start gap-2 w-2/3" onSubmit={e => {
            e.preventDefault()
            dispatch({ type: 'set-credentials', credentials })
            setTimeout(() => open(), 100)
          }}>
            <input className="w-full border-2 border-blue-600 focus:border-blue-400" type="text" placeholder="Username" value={credentials.username} onChange={e => setCredentials({ ...credentials, username: e.target.value })} />
            <input className="w-full border-2 border-blue-600 focus:border-blue-400" type="password" placeholder="Password" value={credentials.password} onChange={e => setCredentials({ ...credentials, password: e.target.value })} />
            <Button className="w-full" type="submit" size="lg">Login</Button>
          </form>
          <p className="text-center text-sm text-red-600 opacity-80">If you are having errors signing in try another username.</p>
        </div>
      )
    }
  }
  return (
    <P2PProvider>
      <Suspense fallback={<LoadingPage />}>
        <Home />
      </Suspense>
    </P2PProvider>
  )
}

export default App
