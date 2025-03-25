import React from 'react';
import PeerSelector from './PeerSelector';
import LogOut from './LogOut';
import DeviceName from './DeviceName';

interface HeaderProps {

}

const Header: React.FC<HeaderProps> = ({ }) => {

    return (
        <header className="bg-blue-600
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
            <div className="flex 
         items-center 
         flex-wrap 
         justify-between
         w-full
         relative
         max-w-full
         ">

                <div className="flex flex-shrink-0 items-center gap-2">
                    <h3 className="text-xl font-bold">FileShare</h3>
                </div>
                <div className="flex flex-grow items-center justify-end flex-wrap gap-1">
                    <DeviceName/>
                    <PeerSelector/>
                    <LogOut/>
                </div>
            </div>
        </header>
    );
};

export default Header;