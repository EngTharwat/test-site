import { ImageResponse } from 'next/og'

// 512×512 maskable app icon — brand-blue field, white PMBoards mark.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80" fill="none">
  <rect x="2.5" y="2.5" width="115" height="75" rx="13" stroke="white" stroke-width="5"/>
  <rect x="22.5" y="22.5" width="35" height="35" rx="5" stroke="white" stroke-width="5"/>
  <rect x="67.5" y="40" width="5" height="20" rx="2.5" fill="white"/>
  <rect x="82.5" y="30" width="5" height="30" rx="2.5" fill="white"/>
  <rect x="97.5" y="20" width="5" height="40" rx="2.5" fill="white"/>
</svg>`

export default function Icon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(LOGO).toString('base64')}`
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', background: '#2563FF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* logo kept within the maskable safe zone (~60% of canvas) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={300} height={200} alt="" />
      </div>
    ),
    { ...size },
  )
}
