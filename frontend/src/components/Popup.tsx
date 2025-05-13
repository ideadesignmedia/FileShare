import React from 'react';

interface PopupComponentProps {
  children: React.ReactNode;
  removePopup?: () => void;
}

const PopupComponent: React.FC<PopupComponentProps> = ({ children, removePopup }) => {
  return (
    <div className="fixed w-full h-full max-h-full max-w-full overflow-hidden inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative bg-white rounded shadow-lg p-2 pt-12 overflow-y-auto overflow-x-hidden max-w-full max-h-full min-w-4/5">
        {removePopup && (
          <span
            onClick={removePopup}
            className="absolute top-1 right-1 text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer p-1 border-1 hover:bg-blue-500 transition-all border-blue-500 bg-white rounded"
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