import React, { Suspense, useState } from 'react'
import { useAppContext } from './context/AppContext'
import { useSocket } from './context/SocketContext'
import { P2PProvider } from './context/P2PContext'
import LoadingPage from './components/LoadingPage'

const Home = React.lazy(() => import('./Home'))

function App() {
  const { state, dispatch } = useAppContext()
  const { open } = useSocket()
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  if (!state.loaded) {
    if (state.loading || state.token) {
      return (
        <LoadingPage/>
      )
    } else {
      return (
        <div className="loading">
          <h1>Login</h1>
          <form onSubmit={e => {
            e.preventDefault()
            dispatch({ type: 'set-credentials', credentials })
            setTimeout(() => open(), 100)
          }}>
            <input type="text" placeholder="Username" value={credentials.username} onChange={e => setCredentials({ ...credentials, username: e.target.value })} />
            <input type="password" placeholder="Password" value={credentials.password} onChange={e => setCredentials({ ...credentials, password: e.target.value })} />
            <button type="submit">Login</button>
          </form>
        </div>
      )
    }
  }
  return (
    <P2PProvider>
      <Suspense fallback={<LoadingPage/>}>
        <Home/>
      </Suspense>
    </P2PProvider>
  )
}

export default App
