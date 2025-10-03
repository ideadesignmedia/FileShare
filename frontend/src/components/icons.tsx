import React from "react";

export default {
  down: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>,
  up: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>,
  cog: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-6 h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3c.6 0 1 .4 1 1v1.09a7.9 7.9 0 0 1 2 .83l.77-.77c.4-.4 1-.4 1.4 0l1.1 1.1c.4.4.4 1 0 1.4l-.77.77c.33.63.6 1.3.77 2H20c.6 0 1 .4 1 1v1.5c0 .6-.4 1-1 1h-1.09a7.9 7.9 0 0 1-.83 2l.77.77c.4.4.4 1 0 1.4l-1.1 1.1c-.4.4-1 .4-1.4 0l-.77-.77c-.63.33-1.3.6-2 .77V20c0 .6-.4 1-1 1h-1.5c-.6 0-1-.4-1-1v-1.09a7.9 7.9 0 0 1-2-.83l-.77.77c-.4.4-1 .4-1.4 0l-1.1-1.1c-.4-.4-.4-1 0-1.4l.77-.77c-.33-.63-.6-1.3-.77-2H4c-.6 0-1-.4-1-1V11c0-.6.4-1 1-1h1.09a7.9 7.9 0 0 1 .83-2l-.77-.77c-.4-.4-.4-1 0-1.4l1.1-1.1c.4-.4 1-.4 1.4 0l.77.77c.63-.33 1.3-.6 2-.77V4c0-.6.4-1 1-1z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  pause: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 5h-1a1 1 0 00-1 1v12a1 1 0 001 1h1a1 1 0 001-1V6a1 1 0 00-1-1zm5 0h-1a1 1 0 00-1 1v12a1 1 0 001 1h1a1 1 0 001-1V6a1 1 0 00-1-1z" />
    </svg>
  ),
  play: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 6v12l10-6-10-6z" />
    </svg>
  ),
  hamburger: <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-6 h-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 6h16M4 12h16M4 18h16"
    />
  </svg>,
  x: <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-[22px] h-[22px]"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>,
  xSmall: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  ),
  refresh: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 3v5h-5" />
    </svg>
  ),
  save: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5 5 5-5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3" />
      <rect x="4" y="15" width="16" height="6" rx="2" />
    </svg>
  ),
  send: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5l7 7-7 7" />
    </svg>
  ),
  trash: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <rect x="5" y="6" width="14" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 10v6M14 10v6" />
    </svg>
  ),
  folder: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  ),
  file: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6h6" />
    </svg>
  ),
  image: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="10" r="2" />
      <path d="M21 17l-6-6-4 4-2-2-5 5" />
    </svg>
  ),
  video: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 8l4-2v12l-4-2z" />
    </svg>
  ),
  audio: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 18V6l10-2v10" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="19" cy="14" r="2" />
    </svg>
  ),
  pdf: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M14 3v6h6" />
      <path d="M8 15h8" />
      <path d="M8 12h8" />
    </svg>
  ),
  zip: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M10 6h4M10 10h4M10 14h4" />
    </svg>
  ),
  code: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 9l-4 3 4 3" />
      <path d="M16 9l4 3-4 3" />
    </svg>
  ),
  doc: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
      <path d="M14 3v6h6" />
      <path d="M8 14h8M8 17h8" />
    </svg>
  ),
  sheet: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 4v16M4 12h16" />
    </svg>
  ),
  slides: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M12 17v2M8 19h8" />
    </svg>
  ),
  text: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h16M4 12h10M4 17h12" />
    </svg>
  ),
  plus: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  ),
  power: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 1 1-12.728 0" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v10" />
    </svg>
  ),
  dropzone: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5-5 5 5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v9" />
      <rect x="3" y="14" width="18" height="6" rx="2" ry="2" />
    </svg>
  ),
  check: (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l5 5L20 7" />
    </svg>
  )
}
