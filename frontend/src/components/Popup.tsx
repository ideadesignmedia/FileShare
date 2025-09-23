import React from 'react';

interface PopupComponentProps {
  children: React.ReactNode;
  removePopup?: () => void;
  contentClassName?: string;
  topPadClassName?: string;
  closeLeftFixed?: boolean;
  closeRightFixed?: boolean;
  closeRightAbsolute?: boolean;
  closeOnRoot?: boolean;
}

const PopupComponent: React.FC<PopupComponentProps> = ({ children, removePopup, contentClassName, topPadClassName, closeLeftFixed, closeRightFixed, closeRightAbsolute, closeOnRoot }) => {
  return (
    <div className="fixed w-full h-full max-h-full max-w-full overflow-hidden inset-0 z-50 flex items-center justify-center bg-blue-700/45 backdrop-blur-[2px]">
      {removePopup && closeOnRoot && (
        <span
          onClick={removePopup}
          className={(closeLeftFixed ? 'fixed left-4 top-4 z-50' : 'fixed right-4 top-4 z-50') + ' text-slate-100 hover:text-white focus:outline-none cursor-pointer p-1 rounded'}
          aria-label="Close Popup"
        >
          &#x2715;
        </span>
      )}
      <div className={`relative isolate bg-white rounded-xl shadow-2xl p-4 ${topPadClassName || 'pt-12'} w-[min(92vw,42rem)] max-h-[90vh] ${contentClassName || 'overflow-y-auto overflow-x-hidden'}`}>
        {removePopup && !closeOnRoot && (
          <span
            onClick={removePopup}
            className={
              (closeRightFixed
                ? 'fixed top-4 right-4 z-50'
                : closeLeftFixed
                ? 'fixed left-3 top-3 z-50'
                : closeRightAbsolute
                ? 'absolute top-2 right-2 z-50'
                : 'absolute top-3 right-3') +
              ' text-slate-500 hover:text-slate-700 focus:outline-none cursor-pointer p-1 rounded'
            }
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
