import React, { useMemo, useState } from 'react';
import PeerSelector from './PeerSelector';
import LogOut from './LogOut';
import DeviceName from './DeviceName';
import AutoAccept from './AutoAccept';
import device, { deviceTypes } from '../constants/device-browser';
import icons from './icons';
import Button from './Button';

interface HeaderProps {

}
const isDesktop = deviceTypes.Desktop === device.deviceType
const Header: React.FC<HeaderProps> = ({ }) => {
    const [showMore, setShowMore] = useState(isDesktop)
    const headerOptions = useMemo(() => {
        return <>
        {!isDesktop ? <Button variant="danger" size="sm" className="absolute top-1 right-1 pointer" onClick={() => {
            setShowMore(false)
        }}>{icons.x}</Button> : null}
        <div className='grow'>
            <DeviceName />
        </div>
        <PeerSelector />
        <AutoAccept/>
        <LogOut />
        </>
    }, [])
    return (
        <header className="bg-blue-700
         text-white 
         px-3
         pt-2
         pb-1
         shadow-md 
         w-full
         max-w-full
        flex
         sticky 
         
         top-0
         z-10
         min-h-18
        ">
            <div className={`flex 
         items-center 
         flex-wrap 
         w-full
         relative
         max-w-full
         gap-2
         ${(!isDesktop && showMore) ? 'flex-col justify-start' : 'justify-between'}`}>

                <div className="flex flex-shrink-0 items-center gap-2">
                    <h3 className="text-xl font-bold text-white">FileShare</h3>
                </div>
                <div className={isDesktop ? "flex flex-grow items-center justify-end flex-wrap gap-2" : "flex flex-col items-center justify-start mt-2 gap-2"}>
                    {showMore ? headerOptions : <div className="pointer" onClick={() => setShowMore(true)}>
                        {icons.hamburger}    
                    </div>}
                </div>
            </div>
        </header>
    );
};

export default Header;