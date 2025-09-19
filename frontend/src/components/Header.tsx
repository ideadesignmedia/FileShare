import React, { useMemo } from 'react';
import device, { deviceTypes } from '../constants/device-browser';
import icons from './icons';
import Button from './Button';
import { useAppContext } from '../context/AppContext';

interface HeaderProps {

}
const isDesktop = deviceTypes.Desktop === device.deviceType
const Header: React.FC<HeaderProps> = ({ }) => {
    const { addPopup, files } = useAppContext()
    const headerOptions = useMemo(() => {
        return <>
            <Button size="sm" variant="light" className="font-medium uppercase" onClick={() => addPopup('saved-files')}>Files ({files.length})</Button>
            <Button icon size="sm" variant="light" className="h-8 w-8 leading-none inline-flex items-center justify-center" onClick={() => addPopup('settings')} aria-label="Settings">{icons.cog}</Button>
        </>
    }, [files, addPopup])
    return (
        <header className="sticky top-0 z-10 w-full bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow">
            <div className="w-full px-3 pt-2 pb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-h-10">
                    <h3 className="text-xl font-bold tracking-tight">FileShare</h3>
                </div>
                <div className="flex flex-grow items-center justify-end flex-wrap gap-2">
                    {headerOptions}
                </div>
            </div>
        </header>
    );
};

export default Header;
