import React from 'react';
import Button from './Button';

interface ConfirmPopupProps {
  message: string;
  onConfirm: (confirmed: boolean) => void;
}

const ConfirmPopup: React.FC<ConfirmPopupProps> = ({ message, onConfirm }) => {
  return (
    <div className="flex flex-col items-center space-y-4">
      <p className="text-lg">{message}</p>
      <div className="flex gap-3">
        <Button onClick={() => onConfirm(true)}>Confirm</Button>
        <Button variant="secondary" onClick={() => onConfirm(false)}>Cancel</Button>
      </div>
    </div>
  );
};

export default ConfirmPopup;
