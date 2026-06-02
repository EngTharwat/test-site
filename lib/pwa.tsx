'use client'

import { useEffect, useState } from 'react'

// Registers the service worker and surfaces an "Install app" button when the
// browser fires beforeinstallprompt (Android/Chromium). iOS users install via
// Share → Add to Home Screen (no programmatic prompt exists there).
export function PwaSetup() {
  const [deferred, setDeferred] = useState<any>(null)
  const [hidden,   setHidden]   = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e) }
    const onInstalled = () => { setDeferred(null); setHidden(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Already running as an installed app → never show the button
  const standalone = typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
     (window.navigator as any).standalone === true)

  if (!deferred || hidden || standalone) return null

  return (
    <button
      onClick={async () => {
        deferred.prompt()
        try { await deferred.userChoice } catch {}
        setDeferred(null)
      }}
      className="fixed bottom-4 right-4 z-[3000] flex items-center gap-2 bg-[#2563FF] text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl shadow-lg hover:bg-[#1A3FAE] transition-colors"
      aria-label="Install PMBoards app"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
      </svg>
      Install app
    </button>
  )
}
