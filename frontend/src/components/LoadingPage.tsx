import React from 'react';
import Spinner from './Spinner';

const LoadingPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center w-full h-auto gap-3">
      <h5 className="text-xl font-semibold">Loading</h5>
      <Spinner />
    </div>
  );
};

export default LoadingPage;
