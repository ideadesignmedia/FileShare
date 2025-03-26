import React from 'react';

interface PopupComponentProps {
  children: React.ReactNode;
  removePopup?: () => void;
}

const PopupComponent: React.FC<PopupComponentProps> = ({ children, removePopup }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative bg-white rounded shadow-lg p-6">
        {removePopup && (
          <button
            onClick={removePopup}
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label="Close Popup"
          >
            &#x2715;
          </button>
        )}
        {children}
      </div>
    </div>
  );
};

export default PopupComponent;