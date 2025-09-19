import React from 'react'
import DeviceName from './DeviceName'
import AutoAccept from './AutoAccept'
import AutoDownload from './AutoDownload'
import LogOut from './LogOut'
import device from '../constants/device-browser'

const SettingsPopup: React.FC = () => {
  return (
    <div className="w-full max-w-full">
      <h3 className="mb-3">Settings</h3>
      <div className="flex flex-col gap-4">
        <section className="bg-white rounded-lg border border-slate-200 p-3">
          <h5 className="mb-2">Account</h5>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <DeviceName />
            <LogOut />
          </div>
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-3">
          <h5 className="mb-2">Preferences</h5>
          <div className="flex items-center gap-4 flex-wrap">
            <AutoAccept />
            {!device.app && <AutoDownload />}
          </div>
        </section>
      </div>
    </div>
  )
}

export default SettingsPopup

