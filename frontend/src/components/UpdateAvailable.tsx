import React from 'react'
import Button from './Button'
import device from '../constants/device-browser'

function UpdateAvailableScreen({setVisible}: {setVisible: React.Dispatch<React.SetStateAction<boolean>>}) {
    return <div>
        <h3>An Update Is Available</h3>
        <div className="w-full flex gap-2 justify-between items-center">
            <Button onClick={() => {
                setVisible(false)
            }} variant='danger'>Maybe Later</Button>
            <Button onClick={() => {
                if (device.app) {
                    document.querySelector('base')?.remove()
                    window.location.reload()
                } else {
                    window.location.reload()
                }
            }}>Reload With Update</Button>
        </div>
    </div>
}

export default React.memo(UpdateAvailableScreen)