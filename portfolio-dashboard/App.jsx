/**
 * Infrastructure Project Portfolio Dashboard
 * Drop into a Vite + React project as src/App.jsx
 * No external dependencies beyond React itself.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

/* ─── GLOBAL STYLES ──────────────────────────────────────────────────────────
   Injected once as a <style> tag so the component is truly self-contained.    */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-base:      #0f1117;
    --bg-card:      #161b24;
    --bg-elevated:  #1e2535;
    --accent:       #f59e0b;
    --accent-dim:   #b45309;
    --green:        #22c55e;
    --red:          #ef4444;
    --amber:        #f59e0b;
    --gray:         #6b7280;
    --text-pri:     #f1f5f9;
    --text-sec:     #94a3b8;
    --border:       rgba(255,255,255,0.08);
  }

  html, body, #root { height: 100%; }

  body {
    background: var(--bg-base);
    color: var(--text-pri);
    font-family: 'DM Sans', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  /* scrollbar */
  ::-webkit-scrollbar           { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track     { background: transparent; }
  ::-webkit-scrollbar-thumb     { background: #2a3248; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover{ background: var(--accent); }

  .f-display { font-family: 'Barlow Condensed', sans-serif; }
  .f-mono    { font-family: 'JetBrains Mono', monospace; }
  .tabular   { font-variant-numeric: tabular-nums; }

  /* ── amber glow on hover ── */
  .glow-hover {
    transition: border-color .18s, box-shadow .18s;
    border: 1px solid var(--border);
  }
  .glow-hover:hover {
    border-color: rgba(245,158,11,.3);
    box-shadow: 0 0 0 1px rgba(245,158,11,.15), 0 4px 20px rgba(0,0,0,.35);
  }

  /* amber border always-on for warning cards */
  .warn-border {
    border: 1px solid rgba(245,158,11,.4) !important;
    box-shadow: 0 0 12px rgba(245,158,11,.08);
  }

  /* ── pulsing delayed badge ── */
  @keyframes statusPulse {
    0%,100% { opacity:1; }
    50%      { opacity:.45; }
  }
  .badge-delayed { animation: statusPulse 1.8s ease-in-out infinite; }

  /* ── card fade-in on mount / filter ── */
  @keyframes fadeUp {
    from { opacity:0; transform: translateY(8px); }
    to   { opacity:1; transform: translateY(0); }
  }
  .fade-up { animation: fadeUp .22s ease both; }

  /* ── milestone dot tooltip ── */
  .m-wrap          { position: relative; display: flex; align-items: center; }
  .m-wrap .m-tip   { display: none; position: absolute; bottom: calc(100% + 7px);
                     left: 50%; transform: translateX(-50%); white-space: nowrap;
                     background: #1e2535; border: 1px solid rgba(245,158,11,.3);
                     color: #f1f5f9; font-size: 11px; padding: 4px 9px;
                     border-radius: 5px; z-index: 99; pointer-events: none;
                     font-family: 'DM Sans', sans-serif; }
  .m-wrap:hover .m-tip { display: block; }

  /* ── progress bar transition ── */
  .bar-fill { transition: width 1s cubic-bezier(.4,0,.2,1); }

  button { cursor: pointer; background: none; border: none; font-family: inherit; }
`

/* ─── MOCK DATA ──────────────────────────────────────────────────────────── */
const PROJECTS = [
  {
    id: 'P-001', name: 'King Salman Road Extension',
    category: 'Roads & Infrastructure', client: 'Ministry of Transport', region: 'Riyadh',
    status: 'active', completion: 67,
    startDate: '2024-01-15', endDate: '2025-08-30',
    contractValue: 48_500_000, billedToDate: 28_900_000,
    collectedToDate: 24_100_000, pendingCollection: 4_800_000, retentionHeld: 2_890_000,
    budget: { total: 41_000_000, spent: 30_200_000 },
    headcount: 142, subcontractors: 6, openRFIs: 4, openNCRs: 2,
    safetyIncidents: 0, safetyDays: 312,
    milestones: [
      { name: 'Site Mobilization',   due: '2024-02-01', done: true  },
      { name: 'Earthworks Complete', due: '2024-07-01', done: true  },
      { name: 'Base Course Layer',   due: '2024-11-01', done: false },
      { name: 'Asphalt Paving',      due: '2025-03-01', done: false },
      { name: 'Handover',            due: '2025-08-30', done: false },
    ],
  },
  {
    id: 'P-002', name: 'Al Noor Water Treatment Plant',
    category: 'Water & Utilities', client: 'NWC', region: 'Eastern Province',
    status: 'delayed', completion: 41,
    startDate: '2023-09-01', endDate: '2025-06-30',
    contractValue: 92_000_000, billedToDate: 35_000_000,
    collectedToDate: 28_000_000, pendingCollection: 7_000_000, retentionHeld: 3_500_000,
    budget: { total: 78_000_000, spent: 41_000_000 },
    headcount: 211, subcontractors: 11, openRFIs: 12, openNCRs: 7,
    safetyIncidents: 1, safetyDays: 87,
    milestones: [
      { name: 'Civil Works',                    due: '2024-03-01', done: true  },
      { name: 'Mechanical Install',              due: '2024-09-01', done: false },
      { name: 'Electrical & Instrumentation',   due: '2025-01-01', done: false },
      { name: 'Commissioning',                  due: '2025-05-01', done: false },
      { name: 'Handover',                       due: '2025-06-30', done: false },
    ],
  },
  {
    id: 'P-003', name: 'Jubail Industrial Paving Package 3',
    category: 'Industrial', client: 'SABIC', region: 'Eastern Province',
    status: 'completed', completion: 100,
    startDate: '2023-03-01', endDate: '2024-05-31',
    contractValue: 17_800_000, billedToDate: 17_800_000,
    collectedToDate: 16_020_000, pendingCollection: 1_780_000, retentionHeld: 0,
    budget: { total: 15_000_000, spent: 14_200_000 },
    headcount: 0, subcontractors: 3, openRFIs: 0, openNCRs: 0,
    safetyIncidents: 0, safetyDays: 421,
    milestones: [
      { name: 'Phase 1 Paving',  due: '2023-09-01', done: true },
      { name: 'Phase 2 Paving',  due: '2024-02-01', done: true },
      { name: 'Snag Clearance',  due: '2024-05-15', done: true },
      { name: 'Final Handover',  due: '2024-05-31', done: true },
    ],
  },
  {
    id: 'P-004', name: 'Medina Ring Road Section 7',
    category: 'Roads & Infrastructure', client: 'Arriyadh Development Authority', region: 'Medina',
    status: 'on-hold', completion: 18,
    startDate: '2024-06-01', endDate: '2026-12-31',
    contractValue: 134_000_000, billedToDate: 12_000_000,
    collectedToDate: 9_600_000, pendingCollection: 2_400_000, retentionHeld: 1_200_000,
    budget: { total: 112_000_000, spent: 13_500_000 },
    headcount: 34, subcontractors: 2, openRFIs: 3, openNCRs: 1,
    safetyIncidents: 0, safetyDays: 198,
    milestones: [
      { name: 'Design Freeze',        due: '2024-07-01', done: true  },
      { name: 'Site Mobilization',    due: '2024-09-01', done: false },
      { name: 'Main Works Start',     due: '2025-03-01', done: false },
      { name: 'Structures Complete',  due: '2026-06-01', done: false },
      { name: 'Handover',             due: '2026-12-31', done: false },
    ],
  },
]

/* ─── HELPERS ─────────────────────────────────────────────────────────────── */
const TODAY = new Date()

function fmtSAR(n) {
  if (n >= 1e9) return 'SAR ' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return 'SAR ' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return 'SAR ' + (n / 1e3).toFixed(0) + 'K'
  return 'SAR ' + n
}
function fmtShort(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}
function daysLeft(dateStr) {
  return Math.ceil((new Date(dateStr) - TODAY) / 86_400_000)
}
function isOverdue(dateStr) { return new Date(dateStr) < TODAY }

const STATUS_META = {
  'active':    { label: 'ACTIVE',    color: '#22c55e', dot: '#22c55e' },
  'delayed':   { label: 'DELAYED',   color: '#ef4444', dot: '#ef4444' },
  'on-hold':   { label: 'ON HOLD',   color: '#f59e0b', dot: '#f59e0b' },
  'completed': { label: 'COMPLETED', color: '#6b7280', dot: '#6b7280' },
}

function progressColor(status) {
  if (status === 'active')    return '#22c55e'
  if (status === 'delayed')   return '#ef4444'
  if (status === 'on-hold')   return '#f59e0b'
  if (status === 'completed') return '#22c55e'
  return '#6b7280'
}

/* ─── COUNT-UP HOOK ───────────────────────────────────────────────────────── */
function useCountUp(target, duration = 1100) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  const t0  = useRef(null)

  useEffect(() => {
    t0.current = null
    const step = ts => {
      if (!t0.current) t0.current = ts
      const p  = Math.min((ts - t0.current) / duration, 1)
      const e  = 1 - Math.pow(1 - p, 3) // ease-out-cubic
      setVal(Math.floor(e * target))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])

  return val
}

/* ─── KPI CARD ────────────────────────────────────────────────────────────── */
function KpiCard({ icon, label, rawValue, isSAR, isCount, warn }) {
  const animated = useCountUp(rawValue)
  const display  = isSAR
    ? fmtSAR(animated)
    : isCount
      ? animated.toLocaleString()
      : fmtShort(animated)

  return (
    <div className={`glow-hover${warn ? ' warn-border' : ''}`} style={{
      background: 'linear-gradient(135deg,#161b24 0%,#19202e 100%)',
      borderRadius: 10, padding: '14px 18px',
      flex: '1 1 140px', minWidth: 130,
      cursor: 'default',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
        <span style={{ fontSize:17 }}>{icon}</span>
        <span style={{ fontSize:10, color:'var(--text-sec)', textTransform:'uppercase',
                       letterSpacing:'.07em' }}>{label}</span>
      </div>
      <div className="f-display tabular" style={{
        fontSize: 26, fontWeight: 800, lineHeight: 1,
        color: warn ? 'var(--accent)' : 'var(--text-pri)',
        letterSpacing: '-.3px',
      }}>
        {display}
      </div>
    </div>
  )
}

/* ─── PROGRESS BAR ────────────────────────────────────────────────────────── */
function Bar({ pct, color, height = 7 }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(pct), 80); return () => clearTimeout(t) }, [pct])
  return (
    <div style={{ background:'rgba(255,255,255,.07)', borderRadius:4, height, overflow:'hidden' }}>
      <div className="bar-fill" style={{
        height:'100%', width:`${w}%`,
        background: color, borderRadius:4,
        boxShadow: `0 0 8px ${color}55`,
      }} />
    </div>
  )
}

/* ─── STATUS BADGE ────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META['active']
  return (
    <span className={status === 'delayed' ? 'badge-delayed' : ''} style={{
      background: m.color + '22', color: m.color,
      border: `1px solid ${m.color}55`,
      borderRadius: 4, padding: '2px 8px',
      fontSize: 10, fontWeight: 700,
      fontFamily: "'Barlow Condensed', sans-serif",
      letterSpacing: '.1em',
    }}>
      {m.label}
    </span>
  )
}

/* ─── MILESTONE DOT ───────────────────────────────────────────────────────── */
function MDot({ m }) {
  const ov    = !m.done && isOverdue(m.due)
  const color = m.done ? 'var(--accent)' : ov ? 'var(--red)' : 'transparent'
  const bord  = m.done ? 'var(--accent)' : ov ? 'var(--red)' : 'var(--gray)'
  const tip   = `${m.name}  ·  ${m.due}${m.done ? '  ✓' : ov ? '  OVERDUE' : ''}`
  return (
    <div className="m-wrap">
      <div style={{
        width:13, height:13, borderRadius:'50%',
        background: color, border:`2px solid ${bord}`,
        transition: 'transform .12s',
        flexShrink: 0,
      }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.4)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      />
      <span className="m-tip">{tip}</span>
    </div>
  )
}

/* ─── PROJECT CARD ────────────────────────────────────────────────────────── */
function ProjectCard({ project }) {
  const [expanded, setExpanded] = useState(false)
  const p       = project
  const budgPct = Math.round((p.budget.spent / p.budget.total) * 100)
  const over    = budgPct > 95
  const days    = daysLeft(p.endDate)
  const pColor  = progressColor(p.status)

  return (
    <div
      className="glow-hover fade-up"
      onClick={() => setExpanded(v => !v)}
      style={{
        background: 'linear-gradient(160deg,#161b24 0%,#13181f 100%)',
        borderRadius: 10, overflow:'hidden', cursor:'pointer',
        position:'relative',
      }}
    >
      {/* top accent line */}
      <div style={{ height:3, background:`linear-gradient(90deg,${pColor},transparent)` }} />

      <div style={{ padding:'16px 18px' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <span className="f-mono" style={{
              background:'#1e2535', color:'var(--accent)',
              border:'1px solid rgba(245,158,11,.3)',
              borderRadius:4, padding:'2px 7px', fontSize:11, fontWeight:500,
            }}>
              {p.id}
            </span>
            <StatusBadge status={p.status} />
          </div>
          <span style={{ fontSize:10, color:'var(--gray)', fontFamily:"'JetBrains Mono',monospace" }}>
            {p.category}
          </span>
        </div>

        <h3 className="f-display" style={{ fontSize:18, fontWeight:700, lineHeight:1.2, marginBottom:5 }}>
          {p.name}
        </h3>
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'var(--text-sec)' }}>{p.client}</span>
          <span style={{ color:'#2a3248', fontSize:10 }}>•</span>
          <span style={{
            fontSize:11, color:'var(--accent)',
            background:'rgba(245,158,11,.1)',
            border:'1px solid rgba(245,158,11,.2)',
            borderRadius:3, padding:'1px 7px',
          }}>
            {p.region}
          </span>
        </div>

        {/* ── Physical Completion ── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontSize:11, color:'var(--text-sec)', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Physical Completion
            </span>
            <span className="f-display tabular" style={{ fontSize:16, fontWeight:700, color:pColor }}>
              {p.completion}%
            </span>
          </div>
          <Bar pct={p.completion} color={pColor} />
        </div>

        {/* ── Financial Row ── */}
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8,
          background:'rgba(0,0,0,.25)', borderRadius:7,
          padding:'10px 10px', marginBottom:14,
        }}>
          {[
            { lbl:'Contract Value',  val: p.contractValue  },
            { lbl:'Billed to Date',  val: p.billedToDate   },
            { lbl:'Collected',       val: p.collectedToDate},
          ].map(it => (
            <div key={it.lbl} style={{ textAlign:'center' }}>
              <div style={{ fontSize:10, color:'var(--gray)', textTransform:'uppercase',
                            letterSpacing:'.05em', marginBottom:3 }}>
                {it.lbl}
              </div>
              <div className="f-mono tabular" style={{ fontSize:11, fontWeight:500 }}>
                {fmtSAR(it.val)}
              </div>
            </div>
          ))}
        </div>

        {/* ── Budget Burn ── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontSize:11, color:'var(--text-sec)', textTransform:'uppercase', letterSpacing:'.06em' }}>
              Budget Utilization
            </span>
            <span className="f-mono tabular" style={{ fontSize:12, fontWeight:600,
                                                       color: over ? 'var(--red)' : 'var(--text-sec)' }}>
              {budgPct}%{over ? ' ⚠' : ''}
            </span>
          </div>
          <Bar pct={Math.min(budgPct, 100)} color={over ? '#ef4444' : '#3b82f6'} />
        </div>

        {/* ── Risk Indicators ── */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
          {[
            { icon:'🔴', lbl:'NCR',       val: p.openNCRs,       warn: p.openNCRs > 0     },
            { icon:'🟡', lbl:'RFI',       val: p.openRFIs,       warn: false               },
            { icon:'👷', lbl:'HC',        val: p.headcount,      warn: false               },
            { icon:'✅', lbl:'SAFE DAYS', val: p.safetyDays,     green: true               },
            { icon:'⚠️', lbl:'INC',       val: p.safetyIncidents,warn: p.safetyIncidents>0 },
          ].map(it => (
            <div key={it.lbl} style={{
              display:'flex', alignItems:'center', gap:4,
              background: it.warn ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)',
              border: it.warn ? '1px solid rgba(239,68,68,.25)' : '1px solid rgba(255,255,255,.06)',
              borderRadius:5, padding:'3px 8px',
            }}>
              <span style={{ fontSize:11 }}>{it.icon}</span>
              <span style={{ fontSize:10, color:'var(--gray)' }}>{it.lbl}</span>
              <span className="f-mono" style={{
                fontSize:11, fontWeight:600,
                color: it.green ? 'var(--green)' : it.warn ? 'var(--red)' : 'var(--text-pri)',
              }}>
                {it.val}
              </span>
            </div>
          ))}
        </div>

        {/* ── Milestones mini-timeline ── */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:10, color:'var(--gray)', textTransform:'uppercase',
                        letterSpacing:'.06em', marginBottom:7 }}>
            Milestones
          </div>
          <div style={{ display:'flex', alignItems:'center' }}>
            {p.milestones.map((m, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', flex: i < p.milestones.length-1 ? 1 : 'none' }}>
                <MDot m={m} />
                {i < p.milestones.length-1 && (
                  <div style={{
                    flex:1, height:2,
                    background: m.done ? 'rgba(245,158,11,.35)' : 'rgba(255,255,255,.07)',
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Expanded milestones ── */}
        {expanded && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:'rgba(0,0,0,.3)', borderRadius:7, padding:'10px 12px',
              border:'1px solid rgba(255,255,255,.06)', marginBottom:14,
            }}
          >
            <div className="f-display" style={{
              fontSize:11, color:'var(--accent)', fontWeight:600,
              letterSpacing:'.1em', marginBottom:9,
            }}>
              MILESTONES
            </div>
            {p.milestones.map((m, i) => {
              const ov = !m.done && isOverdue(m.due)
              return (
                <div key={i} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 0',
                  borderBottom: i < p.milestones.length-1 ? '1px solid rgba(255,255,255,.05)' : 'none',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{
                      width:8, height:8, borderRadius:'50%', flexShrink:0,
                      background: m.done ? 'var(--accent)' : ov ? 'var(--red)' : 'transparent',
                      border: `2px solid ${m.done ? 'var(--accent)' : ov ? 'var(--red)' : 'var(--gray)'}`,
                    }} />
                    <span style={{ fontSize:12, color: m.done ? 'var(--text-sec)' : 'var(--text-pri)',
                                   textDecoration: m.done ? 'line-through' : 'none' }}>
                      {m.name}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span className="f-mono" style={{ fontSize:11, color:'var(--gray)' }}>{m.due}</span>
                    {m.done && <span style={{ fontSize:10, color:'var(--green)', fontWeight:600 }}>DONE</span>}
                    {ov     && <span style={{ fontSize:10, color:'var(--red)',   fontWeight:600 }}>OVERDUE</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          paddingTop:10, borderTop:'1px solid rgba(255,255,255,.06)',
        }}>
          <span className="f-mono" style={{ fontSize:11, color:'var(--gray)' }}>
            {p.startDate} → {p.endDate}
          </span>
          {p.status === 'completed'
            ? <span style={{
                background:'rgba(34,197,94,.15)', color:'var(--green)',
                border:'1px solid rgba(34,197,94,.3)', borderRadius:4,
                padding:'2px 8px', fontSize:10, fontWeight:700,
                fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:'.1em',
              }}>COMPLETED</span>
            : <span className="f-mono" style={{
                fontSize:11,
                color: days < 0 ? 'var(--red)' : days < 90 ? 'var(--amber)' : 'var(--text-sec)',
              }}>
                {days < 0 ? `${Math.abs(days)}d OVERDUE` : `${days}d left`}
              </span>
          }
        </div>

      </div>
    </div>
  )
}

/* ─── DONUT CHART ─────────────────────────────────────────────────────────── */
function DonutChart() {
  const collected  = PROJECTS.reduce((s,p) => s + p.collectedToDate,  0)
  const pending    = PROJECTS.reduce((s,p) => s + p.pendingCollection,0)
  const retention  = PROJECTS.reduce((s,p) => s + p.retentionHeld,    0)
  const total      = collected + pending + retention

  const segs = [
    { val: collected, color:'#22c55e', label:'Collected' },
    { val: pending,   color:'#f59e0b', label:'Pending'   },
    { val: retention, color:'#3b82f6', label:'Retention' },
  ]

  const R = 52, cx = 68, cy = 68, sw = 15
  const circ = 2 * Math.PI * R
  let off = 0
  const arcs = segs.map(s => {
    const d = (s.val / total) * circ
    const a = { ...s, d, off }
    off += d; return a
  })

  return (
    <div style={{ display:'flex', alignItems:'center', gap:18 }}>
      <svg width={136} height={136} viewBox="0 0 136 136">
        {arcs.map((a,i) => (
          <circle key={i} cx={cx} cy={cy} r={R} fill="none"
            stroke={a.color} strokeWidth={sw}
            strokeDasharray={`${a.d} ${circ - a.d}`}
            strokeDashoffset={-a.off}
            style={{ transform:`rotate(-90deg)`, transformOrigin:`${cx}px ${cy}px` }}
          />
        ))}
        <text x={cx} y={cy-5} textAnchor="middle" fill="#94a3b8"
              fontSize={11} fontFamily="'DM Sans',sans-serif">Total</text>
        <text x={cx} y={cy+12} textAnchor="middle" fill="#f59e0b"
              fontSize={14} fontFamily="'Barlow Condensed',sans-serif" fontWeight={800}>
          {fmtShort(total)}
        </text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {segs.map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }} />
            <div>
              <div style={{ fontSize:10, color:'var(--gray)', textTransform:'uppercase', letterSpacing:'.05em' }}>
                {s.label}
              </div>
              <div className="f-mono tabular" style={{ fontSize:12, fontWeight:500 }}>
                {fmtSAR(s.val)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── STATUS BAR CHART ────────────────────────────────────────────────────── */
function StatusBars() {
  const counts = { active:0, delayed:0, 'on-hold':0, completed:0 }
  PROJECTS.forEach(p => counts[p.status]++)
  const max = Math.max(...Object.values(counts))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
      {Object.entries(counts).map(([st, n]) => {
        const m = STATUS_META[st]
        return (
          <div key={st} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span className="f-display" style={{
              width:72, fontSize:11, fontWeight:700, color:'var(--text-sec)',
              textTransform:'uppercase', letterSpacing:'.05em', flexShrink:0,
            }}>
              {m.label}
            </span>
            <div style={{ flex:1, background:'rgba(255,255,255,.06)', borderRadius:3, height:14, overflow:'hidden' }}>
              <div style={{
                height:'100%', width:`${(n/max)*100}%`,
                background: m.color, borderRadius:3,
                transition:'width .9s cubic-bezier(.4,0,.2,1)',
              }} />
            </div>
            <span className="f-mono" style={{ fontSize:12, fontWeight:600, width:16, textAlign:'right' }}>
              {n}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─── TOP RISK TABLE ──────────────────────────────────────────────────────── */
function TopRisk() {
  const sorted = [...PROJECTS].sort((a,b) =>
    (b.openNCRs+b.openRFIs) - (a.openNCRs+a.openRFIs)
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
      {sorted.map(p => (
        <div key={p.id} style={{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background:'rgba(0,0,0,.25)', borderRadius:6,
          border:'1px solid rgba(255,255,255,.05)', padding:'7px 10px',
        }}>
          <div>
            <div style={{ fontSize:12, fontWeight:500 }}>{p.name}</div>
            <div style={{ display:'flex', gap:10, marginTop:2 }}>
              <span style={{ fontSize:10, color:'var(--red)' }}>NCR: {p.openNCRs}</span>
              <span style={{ fontSize:10, color:'var(--amber)' }}>RFI: {p.openRFIs}</span>
            </div>
          </div>
          <StatusBadge status={p.status} />
        </div>
      ))}
    </div>
  )
}

/* ─── UPCOMING MILESTONES ─────────────────────────────────────────────────── */
function UpcomingMilestones() {
  const horizon = new Date(TODAY); horizon.setDate(horizon.getDate() + 90)
  const items = []
  PROJECTS.forEach(p => {
    p.milestones.forEach(m => {
      if (m.done) return
      const d = new Date(m.due)
      const dl = Math.ceil((d - TODAY) / 86_400_000)
      const ov = d < TODAY
      if (d <= horizon || ov) items.push({ project:p.name, ...m, dl, ov })
    })
  })
  items.sort((a,b) => a.dl - b.dl)

  if (!items.length)
    return <p style={{ fontSize:12, color:'var(--gray)' }}>No milestones in next 90 days.</p>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
      {items.map((it,i) => (
        <div key={i} style={{
          padding:'7px 10px', borderRadius:6,
          background: it.ov ? 'rgba(239,68,68,.07)' : 'rgba(0,0,0,.2)',
          border: it.ov ? '1px solid rgba(239,68,68,.2)' : '1px solid rgba(255,255,255,.05)',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:12, fontWeight:500, color: it.ov ? 'var(--red)' : 'var(--text-pri)' }}>
                {it.name}
              </div>
              <div style={{ fontSize:10, color:'var(--gray)', marginTop:1 }}>{it.project}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
              <span className="f-mono" style={{ fontSize:11, color: it.ov ? 'var(--red)' : 'var(--text-sec)' }}>
                {it.due}
              </span>
              {it.ov
                ? <span style={{
                    fontSize:9, color:'var(--red)', fontWeight:700,
                    background:'rgba(239,68,68,.15)', borderRadius:3, padding:'1px 5px',
                    fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:'.08em',
                  }}>OVERDUE</span>
                : <span style={{ fontSize:10, color:'var(--amber)' }}>{it.dl}d</span>
              }
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── SECTION HEADING ─────────────────────────────────────────────────────── */
function SHead({ title, sub }) {
  return (
    <div style={{ marginBottom:14 }}>
      <h2 className="f-display" style={{
        fontSize:12, fontWeight:700, color:'var(--accent)',
        textTransform:'uppercase', letterSpacing:'.12em',
        display:'flex', alignItems:'center', gap:8,
      }}>
        <span style={{ display:'inline-block', width:3, height:14,
                        background:'var(--accent)', borderRadius:2 }} />
        {title}
      </h2>
      {sub && <p style={{ fontSize:11, color:'var(--gray)', marginTop:3 }}>{sub}</p>}
    </div>
  )
}

/* ─── FILTER BAR ──────────────────────────────────────────────────────────── */
const FILTERS = [
  { key:'all',       label:'All',       dot:'#94a3b8' },
  { key:'active',    label:'Active',    dot:'#22c55e' },
  { key:'delayed',   label:'Delayed',   dot:'#ef4444' },
  { key:'on-hold',   label:'On Hold',   dot:'#f59e0b' },
  { key:'completed', label:'Completed', dot:'#6b7280' },
]

function FilterBar({ active, onChange }) {
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
      {FILTERS.map(f => {
        const count = f.key === 'all'
          ? PROJECTS.length
          : PROJECTS.filter(p => p.status === f.key).length
        const on = active === f.key
        return (
          <button key={f.key} onClick={() => onChange(f.key)} style={{
            display:'flex', alignItems:'center', gap:7,
            background: on ? 'rgba(245,158,11,.12)' : 'rgba(255,255,255,.04)',
            border: on ? '1px solid rgba(245,158,11,.4)' : '1px solid rgba(255,255,255,.08)',
            borderRadius:20, padding:'5px 14px',
            color: on ? 'var(--accent)' : 'var(--text-sec)',
            fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif",
            transition:'all .15s',
          }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:f.dot, flexShrink:0 }} />
            {f.label}
            <span style={{
              background:'rgba(255,255,255,.1)', borderRadius:10,
              padding:'0 6px', fontSize:10, color:'var(--gray)',
              fontFamily:"'JetBrains Mono',monospace",
            }}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ─── SIDEBAR PANEL ───────────────────────────────────────────────────────── */
function SidePanel() {
  const panelCard = {
    background:'linear-gradient(160deg,#161b24 0%,#131720 100%)',
    border:'1px solid var(--border)',
    borderRadius:10, padding:'16px 18px',
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, minWidth:0 }}>
      <div style={panelCard}>
        <SHead title="Financial Overview" />
        <DonutChart />
      </div>
      <div style={panelCard}>
        <SHead title="Status Breakdown" />
        <StatusBars />
      </div>
      <div style={panelCard}>
        <SHead title="Top Risk Projects" sub="Ranked by NCR + RFI" />
        <TopRisk />
      </div>
      <div style={panelCard}>
        <SHead title="Upcoming Milestones" sub="Next 90 days + overdue" />
        <UpcomingMilestones />
      </div>
    </div>
  )
}

/* ─── ROOT APP ────────────────────────────────────────────────────────────── */
export default function App() {
  const [filter,  setFilter]  = useState('all')
  const [clock,   setClock]   = useState('')
  const [filterKey, setFilterKey] = useState(0) // force re-mount cards for fade-in

  /* live clock */
  useEffect(() => {
    const tick = () => setClock(
      new Date().toLocaleString('en-GB', {
        weekday:'short', year:'numeric', month:'short', day:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit',
      })
    )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  /* inject global CSS once */
  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = GLOBAL_CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, [])

  const handleFilter = useCallback(k => {
    setFilter(k)
    setFilterKey(v => v + 1) // re-triggers fade-up on filtered cards
  }, [])

  const filtered = filter === 'all'
    ? PROJECTS
    : PROJECTS.filter(p => p.status === filter)

  /* KPI totals */
  const kpi = {
    portfolio: PROJECTS.reduce((s,p) => s + p.contractValue,      0),
    billed:    PROJECTS.reduce((s,p) => s + p.billedToDate,        0),
    pending:   PROJECTS.reduce((s,p) => s + p.pendingCollection,   0),
    active:    PROJECTS.filter(p => p.status === 'active').length,
    headcount: PROJECTS.reduce((s,p) => s + p.headcount,           0),
    ncrs:      PROJECTS.reduce((s,p) => s + p.openNCRs,            0),
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-base)' }}>

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <header style={{
        background:'linear-gradient(180deg,#0d1019 0%,#0f1117 100%)',
        borderBottom:'2px solid var(--accent)',
        padding:'0 24px', height:62,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        position:'sticky', top:0, zIndex:100,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:28 }}>🦺</span>
          <div>
            <div className="f-display" style={{
              fontSize:21, fontWeight:800, letterSpacing:'.02em', lineHeight:1,
            }}>
              Al-Rashid Contracting Co.
            </div>
            <div style={{
              fontSize:10, color:'var(--accent)', letterSpacing:'.16em',
              textTransform:'uppercase', fontFamily:"'Barlow Condensed',sans-serif",
            }}>
              Project Portfolio Command Center
            </div>
          </div>
        </div>
        <div className="f-mono" style={{ fontSize:13, color:'var(--text-sec)', letterSpacing:'.04em' }}>
          {clock}
        </div>
      </header>

      <div style={{ padding:'20px 24px', maxWidth:1640, margin:'0 auto' }}>

        {/* ── KPI STRIP ────────────────────────────────────────────────── */}
        <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
          <KpiCard icon="💰" label="Portfolio Value"    rawValue={kpi.portfolio} isSAR />
          <KpiCard icon="📋" label="Total Billed"       rawValue={kpi.billed}    isSAR />
          <KpiCard icon="⏳" label="Pending Collection" rawValue={kpi.pending}   isSAR  warn />
          <KpiCard icon="🏗️" label="Active Projects"    rawValue={kpi.active}    isCount />
          <KpiCard icon="👷" label="Total Headcount"    rawValue={kpi.headcount} isCount />
          <KpiCard icon="🔴" label="Open NCRs"          rawValue={kpi.ncrs}      isCount warn />
        </div>

        {/* ── MAIN GRID ────────────────────────────────────────────────── */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'1fr 340px',
          gap:20, alignItems:'start',
        }}>

          {/* LEFT: filter + cards */}
          <div>
            <div style={{ marginBottom:16 }}>
              <FilterBar active={filter} onChange={handleFilter} />
            </div>
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(auto-fill, minmax(420px, 1fr))',
              gap:16,
            }}>
              {filtered.map((p, i) => (
                <div key={`${filterKey}-${p.id}`} style={{ animationDelay:`${i * 40}ms` }}>
                  <ProjectCard project={p} />
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: health panel */}
          <SidePanel />
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <div style={{
          marginTop:32, paddingTop:16,
          borderTop:'1px solid rgba(255,255,255,.05)',
          display:'flex', justifyContent:'space-between',
        }}>
          <span className="f-display" style={{ fontSize:11, color:'#1e2535', letterSpacing:'.1em' }}>
            AL-RASHID CONTRACTING CO. — PORTFOLIO COMMAND CENTER
          </span>
          <span className="f-mono" style={{ fontSize:10, color:'#1e2535' }}>
            DATA AS OF {TODAY.toISOString().split('T')[0]}
          </span>
        </div>
      </div>
    </div>
  )
}
