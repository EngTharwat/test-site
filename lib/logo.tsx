'use client'

/**
 * Shared PMBoards logo icon.
 * variant='outline' → currentColor strokes (dark-mode-safe, for light/dark pages)
 * variant='filled'  → white strokes  (for always-dark sidebars)
 */
export function LogoIcon({
  size = 34,
  variant = 'outline',
}: {
  size?: number
  variant?: 'outline' | 'filled'
}) {
  const w = Math.round(size * 1.5)
  const c = variant === 'filled' ? 'white' : 'currentColor'
  return (
    <svg width={w} height={size} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.5"  y="2.5"  width="115" height="75" rx="13" stroke={c} strokeWidth="5" fill="none" />
      <rect x="22.5" y="22.5" width="35"  height="35" rx="5"  stroke={c} strokeWidth="5" fill="none" />
      <rect x="67.5" y="40"   width="5"   height="20" rx="2.5" fill={c} />
      <rect x="82.5" y="30"   width="5"   height="30" rx="2.5" fill={c} />
      <rect x="97.5" y="20"   width="5"   height="40" rx="2.5" fill={c} />
    </svg>
  )
}
