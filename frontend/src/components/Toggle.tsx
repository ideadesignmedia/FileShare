import React, { FC } from 'react';

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
  label?: string;
}

const Toggle: FC<ToggleProps> = ({ enabled, onToggle, label }) => {
  return (
    <div className="flex items-center flex-wrap justify-start">
      {label && <span className="mr-3 font-medium">{label}</span>}
      <div
        className={`relative inline-block w-16 h-8 rounded-full transition-colors duration-300 ${
          enabled ? 'bg-blue-900' : 'bg-gray-300'
        }`}
        onClick={onToggle}
      >
        <span className="sr-only">Toggle Switch</span>
        <span
          className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
            enabled ? 'translate-x-8' : 'translate-x-0'
          }`}
        />
      </div>
    </div>
  );
};

export default Toggle;