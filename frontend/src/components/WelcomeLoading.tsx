import React from 'react'

export default function WelcomeLoading() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-screen min-h-full gap-4 bg-blue-800 text-white">
      <h5 className="text-3xl sm:text-4xl font-semibold tracking-wide">Loading</h5>
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" role="status" />
    </div>
  )
}
