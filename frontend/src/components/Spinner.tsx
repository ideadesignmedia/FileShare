import React from 'react'

type SpinnerProps = {
  variant?: 'primary' | 'inverse',
  size?: 'sm' | 'md' | 'lg'
}

export default React.memo(({ variant = 'primary', size = 'md' }: SpinnerProps) => {
  const sizeClasses = size === 'sm' ? 'w-6 h-6 border-2' : size === 'lg' ? 'w-12 h-12 border-4' : 'w-10 h-10 border-4'
  const colorClasses = variant === 'inverse'
    ? 'border-white/30 border-t-white'
    : 'border-slate-300 border-t-blue-600'
  return (
    <div className={`${sizeClasses} ${colorClasses} rounded-full animate-spin`} role="status" />
  )
})
