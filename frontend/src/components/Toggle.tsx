import React, { FC } from 'react';

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
  label?: string;
}

const Toggle: FC<ToggleProps> = ({ enabled, onToggle, label }) => {
  return (
    <div className="flex items-center justify-between w-full sm:flex-1">
      {label && <span className="mr-3 font-medium text-sm text-slate-700">{label}</span>}
      <button
        type="button"
        aria-pressed={enabled}
        onClick={onToggle}
        className={`relative inline-flex w-14 h-8 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-white/30 ${
          enabled ? 'bg-green-500' : 'bg-slate-300'
        }`}
      >
        <span className="sr-only">Toggle Switch</span>
        <span
          className={`inline-block w-6 h-6 bg-white rounded-full shadow transform transition-transform duration-300 ease-in-out ${
            enabled ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

export default Toggle;
