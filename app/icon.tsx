import { ImageResponse } from 'next/og'

// 512×512 app icon — PMBoards logo in the brand navy-blue on a transparent field.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

const NAVY = '#2563FF' // brand navy-blue
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80" fill="none">
  <rect x="2.5" y="2.5" width="115" height="75" rx="13" stroke="${NAVY}" stroke-width="5"/>
  <rect x="22.5" y="22.5" width="35" height="35" rx="5" stroke="${NAVY}" stroke-width="5"/>
  <rect x="67.5" y="40" width="5" height="20" rx="2.5" fill="${NAVY}"/>
  <rect x="82.5" y="30" width="5" height="30" rx="2.5" fill="${NAVY}"/>
  <rect x="97.5" y="20" width="5" height="40" rx="2.5" fill="${NAVY}"/>
</svg>`

export default function Icon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(LOGO).toString('base64')}`
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={384} height={256} alt="" />
      </div>
    ),
    { ...size },
  )
}
