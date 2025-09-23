import React, { Suspense, useEffect, useState } from 'react'
import { useAppContext } from './context/AppContext'
import { useSocket } from './context/SocketContext'
import { P2PProvider } from './context/P2PContext'
import WelcomeLoading from './components/WelcomeLoading'
import Button from './components/Button'

const Home = React.lazy(() => import('./Home'))

function App() {
  const { state, dispatch, Popup } = useAppContext()
  const { open } = useSocket()
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  useEffect(() => {
    if (!state.loaded) {
      setCredentials({ username: '', password: '' })
    }
  }, [state.loaded])
  useEffect(() => {
    const b = document.body
    if (state.loaded) {
      b.classList.remove('bg-blue-800')
      b.classList.add('bg-white')
      b.classList.remove('unauth')
      b.classList.add('auth')
    } else {
      b.classList.remove('bg-white')
      b.classList.add('bg-blue-800')
      b.classList.remove('auth')
      b.classList.add('unauth')
    }
  }, [state.loaded])

  const content = !state.loaded
    ? (
      (state.loading || state.token)
        ? <WelcomeLoading />
        : (
          <div className="flex flex-col grow items-center justify-center w-full px-3 md:px-6 py-6">
            <div className="w-full max-w-3xl mx-auto m-0">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 shadow">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                  <section className="order-1 md:order-2 bg-white rounded-lg p-3 shadow-inner h-full flex flex-col">
                    <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">Welcome</div>
                    <h3 className="mb-2">Sign in</h3>
                    <p className="text-sm text-slate-700 mb-3">Use any username and password. Sign in on another device with the same credentials to connect and share files securely.</p>
                    {state.loginError && (
                      <div className="text-red-600 text-sm mb-2">{state.loginError}</div>
                    )}
                    <form className="flex flex-col gap-3" autoComplete="off" onSubmit={e => {
                      e.preventDefault()
                      dispatch({ type: 'set-login-error', value: null })
                      dispatch({ type: 'set-credentials', credentials })
                      setTimeout(() => open(), 100)
                    }}>
                      <label className="text-sm text-slate-700">Username
                        <input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30" type="text" placeholder="e.g. Alex" autoComplete="off" value={credentials.username} onChange={e => { if (state.loginError) dispatch({ type: 'set-login-error', value: null }); setCredentials({ ...credentials, username: e.target.value }) }} />
                      </label>
                      <label className="text-sm text-slate-700">Password
                        <input className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30" type="password" placeholder="Enter a password" autoComplete="new-password" value={credentials.password} onChange={e => { if (state.loginError) dispatch({ type: 'set-login-error', value: null }); setCredentials({ ...credentials, password: e.target.value }) }} />
                      </label>
                      <Button className="w-full uppercase tracking-wider" type="submit" size="lg" variant="primary">Continue</Button>
                    </form>
                    <p className="mt-3 text-center text-sm text-slate-700">Having issues? Contact us at <a className="text-blue-700 hover:underline" href="mailto:info@ideadesignmedia.com">info@ideadesignmedia.com</a></p>
                  </section>
                  <section className="order-2 md:order-1 flex flex-col bg-white/70 rounded-lg p-3 border border-white/60 h-full">
                    <div className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-2">About FileShare</div>
                    <div className="flex flex-col gap-[0.1rem] mb-3">
                      <h3 className="m-0 p-0 leading-none text-2xl sm:text-3xl md:text-4xl">Easy and Secure</h3>
                      <h3 className="m-0 p-0 leading-none text-2xl sm:text-3xl md:text-4xl">Peer-to-Peer</h3>
                      <h3 className="m-0 p-0 leading-none text-2xl sm:text-3xl md:text-4xl text-blue-700">File Sharing</h3>
                    </div>
                    <p className="text-slate-700 text-sm mb-2">Your files travel directly between your devices using secure, end‑to‑end connections. Nothing is stored on our servers, and transfers are encrypted in transit for privacy and peace of mind.</p>
                    <div className="flex-1 flex items-center">
                      <ul className="list-disc list-outside pl-5 text-slate-600 text-sm space-y-1 max-w-md">
                        <li>Sign in on two devices with the same credentials.</li>
                        <li>Pick the device under Connections and connect.</li>
                        <li>Easily send files or folders.</li>
                        <li>Watch your transfer's progress.</li>
                        <li>Disconnect at any time.</li>
                      </ul>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )
    ) : (
      <Suspense fallback={<WelcomeLoading />}>
        <Home />
      </Suspense>
    )

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <P2PProvider>
        {Popup}
        {content}
      </P2PProvider>
    </div>
  )
}

export default App
