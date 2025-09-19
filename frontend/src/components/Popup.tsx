import React from 'react';

interface PopupComponentProps {
  children: React.ReactNode;
  removePopup?: () => void;
}

const PopupComponent: React.FC<PopupComponentProps> = ({ children, removePopup }) => {
  return (
    <div className="fixed w-full h-full max-h-full max-w-full overflow-hidden inset-0 z-50 flex items-center justify-center bg-blue-700/45 backdrop-blur-[2px]">
      <div className="relative bg-white rounded-xl shadow-2xl p-4 pt-12 overflow-y-auto overflow-x-hidden w-[min(92vw,42rem)] max-h-[90vh]">
        {removePopup && (
          <span
            onClick={removePopup}
            className="absolute top-3 right-3 text-slate-500 hover:text-slate-700 focus:outline-none cursor-pointer p-1 rounded"
            aria-label="Close Popup"
          >
            &#x2715;
          </span>
        )}
        {children}
      </div>
    </div>
  );
};

export default PopupComponent;
