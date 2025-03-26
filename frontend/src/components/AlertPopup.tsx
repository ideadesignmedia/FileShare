import React from 'react';

interface AlertPopupProps {
  message: string;
}

const AlertPopup: React.FC<AlertPopupProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center space-y-4">
      <p className="text-lg">{message}</p>
    </div>
  );
};

export default AlertPopup;