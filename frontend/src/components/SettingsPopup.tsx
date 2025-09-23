import React from 'react'
import DeviceName from './DeviceName'
import AutoAccept from './AutoAccept'
import AutoDownload from './AutoDownload'
const AutoResume = React.lazy(() => import('./AutoResume'))
import LogOut from './LogOut'
import device from '../constants/device-browser'
import { useAppContext } from '../context/AppContext'
import Button from './Button'
import { clearAllStorage } from '../utils/indexed-db'

const SettingsPopup: React.FC = () => {
  const { confirm, flash, emit } = useAppContext()
  return (
    <>
      <h3 className="mb-3">Settings</h3>
      <div className="flex flex-col gap-4">
        <section className="bg-white rounded-lg border border-slate-200 p-3 overflow-hidden">
          <h5 className="mb-2">Account</h5>
          <div className="flex items-center justify-between gap-3 flex-wrap overflow-hidden">
            <DeviceName />
            <LogOut />
          </div>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-3 overflow-hidden">
          <h5 className="mb-2">Preferences</h5>
          <div className="flex items-center gap-4 flex-wrap">
            <AutoAccept />
            {!device.app && <AutoDownload />}
            <React.Suspense fallback={null}>
              <AutoResume />
            </React.Suspense>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-3 overflow-hidden">
          <h5 className="mb-2">Storage</h5>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className='text-sm text-slate-700'>Clear all stored files and transfer data from this device.</div>
            <Button variant='outlineDanger' onClick={() => {
              confirm('This will permanently delete all stored files and transfer data on this device. This cannot be undone. Continue?', (ok: boolean) => {
                if (!ok) return
                clearAllStorage().then(() => {
                  emit('file-deleted', '*')
                  flash('Storage cleared')
                }).catch(() => flash('Failed to clear storage'))
              })
            }}>Clear Storage</Button>
          </div>
        </section>
      </div>
    </>
  )
}

export default SettingsPopup
