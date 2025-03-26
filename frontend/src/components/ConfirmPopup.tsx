import React from 'react';

interface ConfirmPopupProps {
  message: string;
  onConfirm: (confirmed: boolean) => void;
}

const ConfirmPopup: React.FC<ConfirmPopupProps> = ({ message, onConfirm }) => {
  return (
    <div className="flex flex-col items-center space-y-4">
      <p className="text-lg">{message}</p>
      <div className="flex space-x-4">
        <button
          onClick={() => onConfirm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Confirm
        </button>
        <button
          onClick={() => onConfirm(false)}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ConfirmPopup;