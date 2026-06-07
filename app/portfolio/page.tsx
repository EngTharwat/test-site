'use client';

import { useState, useEffect, useRef } from 'react';

// ─── Google Fonts ────────────────────────────────────────────────────────────
const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --bg-base: #0f1117;
      --bg-card: #161b24;
      --bg-elevated: #1e2535;
      --accent: #f59e0b;
      --accent-dim: #b45309;
      --green: #22c55e;
      --red: #ef4444;
      --amber: #f59e0b;
      --gray: #6b7280;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --border: rgba(255,255,255,0.08);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg-base);
      color: var(--text-primary);
      font-family: 'DM Sans', sans-serif;
      min-height: 100vh;
    }

    .font-display { font-family: 'Barlow Condensed', sans-serif; }
    .font-mono    { font-family: 'JetBrains Mono', monospace; }
    .font-body    { font-family: 'DM Sans', sans-serif; }

    .tabular { font-variant-numeric: tabular-nums; }

    /* pulse animation for delayed */
    @keyframes pulse-badge {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.55; }
    }
    .pulse { animation: pulse-badge 1.8s ease-in-out infinite; }

    /* fade for filter transitions */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .fade-in { animation: fadeIn 0.25s ease forwards; }

    /* card hover amber glow */
    .card-hover:hover {
      box-shadow: 0 0 0 1px rgba(245,158,11,0.35), 0 4px 24px rgba(0,0,0,0.4);
      border-color: rgba(245,158,11,0.25) !important;
    }

    .kpi-hover:hover {
      box-shadow: 0 0 0 1px rgba(245,158,11,0.4), 0 2px 12px rgba(245,158,11,0.08);
      border-color: rgba(245,158,11,0.3) !important;
    }

    /* tooltip */
    .tooltip-wrap { position: relative; }
    .tooltip-wrap:hover .tooltip { display: block; }
    .tooltip {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #1e2535;
      border: 1px solid rgba(245,158,11,0.3);
      color: #f1f5f9;
      font-size: 11px;
      white-space: nowrap;
      padding: 4px 8px;
      border-radius: 4px;
      z-index: 50;
      pointer-events: none;
      font-family: 'DM Sans', sans-serif;
    }

    /* scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #0f1117; }
    ::-webkit-scrollbar-thumb { background: #2a3248; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #f59e0b; }
  `}</style>
);

// ─── Data ────────────────────────────────────────────────────────────────────
const projects = [
  {
    id: 'P-001',
    name: 'King Salman Road Extension',
    category: 'Roads & Infrastructure',
    client: 'Ministry of Transport',
    region: 'Riyadh',
    status: 'active',
    completion: 67,
    startDate: '2024-01-15',
    endDate: '2025-08-30',
    contractValue: 48500000,
    billedToDate: 28900000,
    collectedToDate: 24100000,
    pendingCollection: 4800000,
    retentionHeld: 2890000,
    budget: { total: 41000000, spent: 30200000 },
    headcount: 142,
    subcontractors: 6,
    openRFIs: 4,
    openNCRs: 2,
    safetyIncidents: 0,
    safetyDays: 312,
    milestones: [
      { name: 'Site Mobilization', due: '2024-02-01', done: true },
      { name: 'Earthworks Complete', due: '2024-07-01', done: true },
      { name: 'Base Course Layer', due: '2024-11-01', done: false },
      { name: 'Asphalt Paving', due: '2025-03-01', done: false },
      { name: 'Handover', due: '2025-08-30', done: false },
    ],
  },
  {
    id: 'P-002',
    name: 'Al Noor Water Treatment Plant',
    category: 'Water & Utilities',
    client: 'NWC',
    region: 'Eastern Province',
    status: 'delayed',
    completion: 41,
    startDate: '2023-09-01',
    endDate: '2025-06-30',
    contractValue: 92000000,
    billedToDate: 35000000,
    collectedToDate: 28000000,
    pendingCollection: 7000000,
    retentionHeld: 3500000,
    budget: { total: 78000000, spent: 41000000 },
    headcount: 211,
    subcontractors: 11,
    openRFIs: 12,
    openNCRs: 7,
    safetyIncidents: 1,
    safetyDays: 87,
    milestones: [
      { name: 'Civil Works', due: '2024-03-01', done: true },
      { name: 'Mechanical Install', due: '2024-09-01', done: false },
      { name: 'Electrical & Instrumentation', due: '2025-01-01', done: false },
      { name: 'Commissioning', due: '2025-05-01', done: false },
      { name: 'Handover', due: '2025-06-30', done: false },
    ],
  },
  {
    id: 'P-003',
    name: 'Jubail Industrial Paving Package 3',
    category: 'Industrial',
    client: 'SABIC',
    region: 'Eastern Province',
    status: 'completed',
    completion: 100,
    startDate: '2023-03-01',
    endDate: '2024-05-31',
    contractValue: 17800000,
    billedToDate: 17800000,
    collectedToDate: 16020000,
    pendingCollection: 1780000,
    retentionHeld: 0,
    budget: { total: 15000000, spent: 14200000 },
    headcount: 0,
    subcontractors: 3,
    openRFIs: 0,
    openNCRs: 0,
    safetyIncidents: 0,
    safetyDays: 421,
    milestones: [
      { name: 'Phase 1 Paving', due: '2023-09-01', done: true },
      { name: 'Phase 2 Paving', due: '2024-02-01', done: true },
      { name: 'Snag Clearance', due: '2024-05-15', done: true },
      { name: 'Final Handover', due: '2024-05-31', done: true },
    ],
  },
  {
    id: 'P-004',
    name: 'Medina Ring Road Section 7',
    category: 'Roads & Infrastructure',
    client: 'Arriyadh Development Authority',
    region: 'Medina',
    status: 'on-hold',
    completion: 18,
    startDate: '2024-06-01',
    endDate: '2026-12-31',
    contractValue: 134000000,
    billedToDate: 12000000,
    collectedToDate: 9600000,
    pendingCollection: 2400000,
    retentionHeld: 1200000,
    budget: { total: 112000000, spent: 13500000 },
    headcount: 34,
    subcontractors: 2,
    openRFIs: 3,
    openNCRs: 1,
    safetyIncidents: 0,
    safetyDays: 198,
    milestones: [
      { name: 'Design Freeze', due: '2024-07-01', done: true },
      { name: 'Site Mobilization', due: '2024-09-01', done: false },
      { name: 'Main Works Start', due: '2025-03-01', done: false },
      { name: 'Structures Complete', due: '2026-06-01', done: false },
      { name: 'Handover', due: '2026-12-31', done: false },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TODAY = new Date('2026-06-07');

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(n);
}

function sarFmt(n: number) {
  return 'SAR ' + fmt(n);
}

function daysRemaining(endDate: string) {
  const end = new Date(endDate);
  return Math.ceil((end.getTime() - TODAY.getTime()) / 86400000);
}

function isOverdue(due: string) {
  return new Date(due) < TODAY;
}

function statusColor(status: string) {
  switch (status) {
    case 'active':    return '#22c55e';
    case 'delayed':   return '#ef4444';
    case 'on-hold':   return '#f59e0b';
    case 'completed': return '#6b7280';
    default:          return '#6b7280';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'active':    return 'ACTIVE';
    case 'delayed':   return 'DELAYED';
    case 'on-hold':   return 'ON HOLD';
    case 'completed': return 'COMPLETED';
    default:          return status.toUpperCase();
  }
}

function progressColor(status: string) {
  switch (status) {
    case 'active':    return '#22c55e';
    case 'delayed':   return '#ef4444';
    case 'on-hold':   return '#f59e0b';
    case 'completed': return '#22c55e';
    default:          return '#6b7280';
  }
}

// ─── Count-Up Hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const startTime = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    startTime.current = null;
    const step = (ts: number) => {
      if (!startTime.current) startTime.current = ts;
      const progress = Math.min((ts - startTime.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(ease * target));
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return val;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string;
  rawValue: number;
  isSAR?: boolean;
  isCount?: boolean;
  warn?: boolean;
  icon: string;
}

function KpiCard({ label, rawValue, isSAR, isCount, warn, icon }: KpiProps) {
  const animated = useCountUp(rawValue);
  const display = isSAR ? sarFmt(animated) : isCount ? String(animated) : fmt(animated);

  return (
    <div
      className="kpi-hover"
      style={{
        background: 'linear-gradient(135deg, #161b24 0%, #1a2030 100%)',
        border: warn
          ? '1px solid rgba(245,158,11,0.45)'
          : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '14px 18px',
        flex: '1 1 0',
        minWidth: 140,
        transition: 'border 0.2s, box-shadow 0.2s',
        boxShadow: warn ? '0 0 12px rgba(245,158,11,0.12)' : undefined,
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'DM Sans', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div
        className="font-display tabular"
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: warn ? '#f59e0b' : '#f1f5f9',
          lineHeight: 1,
          letterSpacing: '-0.5px',
        }}
      >
        {display}
      </div>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, color, animated = false }: { pct: number; color: string; animated?: boolean }) {
  const [width, setWidth] = useState(animated ? 0 : pct);
  useEffect(() => {
    if (animated) {
      const t = setTimeout(() => setWidth(pct), 100);
      return () => clearTimeout(t);
    }
  }, [pct, animated]);

  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${width}%`,
          background: color,
          borderRadius: 4,
          transition: animated ? 'width 1s cubic-bezier(0.4,0,0.2,1)' : undefined,
          boxShadow: `0 0 8px ${color}55`,
        }}
      />
    </div>
  );
}

// ─── Milestone Dot ────────────────────────────────────────────────────────────
function MilestoneDot({ m }: { m: { name: string; due: string; done: boolean } }) {
  const overdue = !m.done && isOverdue(m.due);
  const color = m.done ? '#f59e0b' : overdue ? '#ef4444' : 'transparent';
  const border = m.done ? '#f59e0b' : overdue ? '#ef4444' : '#6b7280';

  return (
    <div className="tooltip-wrap" style={{ display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: color,
          border: `2px solid ${border}`,
          cursor: 'default',
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.3)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      />
      <div className="tooltip">
        <strong>{m.name}</strong><br />
        {m.due}{overdue ? ' — OVERDUE' : m.done ? ' — DONE' : ''}
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className={status === 'delayed' ? 'pulse' : ''}
      style={{
        background: color + '22',
        color,
        border: `1px solid ${color}55`,
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'Barlow Condensed',
        letterSpacing: '0.1em',
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────
function ProjectCard({ project }: { project: typeof projects[0] }) {
  const [expanded, setExpanded] = useState(false);
  const days = daysRemaining(project.endDate);
  const budgetPct = Math.round((project.budget.spent / project.budget.total) * 100);
  const budgetOverspent = budgetPct > 95;
  const pColor = progressColor(project.status);

  return (
    <div
      className="card-hover fade-in"
      style={{
        background: 'linear-gradient(160deg, #161b24 0%, #131720 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border 0.2s, box-shadow 0.2s',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Accent top line */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${pColor}, transparent)` }} />

      <div style={{ padding: '16px 18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              className="font-mono"
              style={{
                background: '#1e2535', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 500,
              }}
            >
              {project.id}
            </span>
            <StatusBadge status={project.status} />
          </div>
          <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'JetBrains Mono' }}>
            {project.category}
          </span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <h3
            className="font-display"
            style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2, marginBottom: 4 }}
          >
            {project.name}
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{project.client}</span>
            <span style={{ color: '#2a3248', fontSize: 10 }}>•</span>
            <span
              style={{
                fontSize: 11, color: '#f59e0b',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 3, padding: '1px 6px',
              }}
            >
              {project.region}
            </span>
          </div>
        </div>

        {/* Physical Completion */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Physical Completion
            </span>
            <span
              className="font-display tabular"
              style={{ fontSize: 15, fontWeight: 700, color: pColor }}
            >
              {project.completion}%
            </span>
          </div>
          <ProgressBar pct={project.completion} color={pColor} animated />
        </div>

        {/* Financial Row */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8, marginBottom: 12,
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 6, padding: '10px 10px',
          }}
        >
          {[
            { label: 'Contract Value', val: project.contractValue },
            { label: 'Billed to Date', val: project.billedToDate },
            { label: 'Collected', val: project.collectedToDate },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {item.label}
              </div>
              <div
                className="font-mono tabular"
                style={{ fontSize: 12, fontWeight: 500, color: '#f1f5f9' }}
              >
                {sarFmt(item.val)}
              </div>
            </div>
          ))}
        </div>

        {/* Budget Burn */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Budget Utilization
            </span>
            <span
              className="font-mono tabular"
              style={{ fontSize: 12, fontWeight: 600, color: budgetOverspent ? '#ef4444' : '#94a3b8' }}
            >
              {budgetPct}%{budgetOverspent ? ' ⚠' : ''}
            </span>
          </div>
          <ProgressBar pct={Math.min(budgetPct, 100)} color={budgetOverspent ? '#ef4444' : '#3b82f6'} animated />
        </div>

        {/* Risk Indicators */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { icon: '🔴', label: 'NCR', val: project.openNCRs, warn: project.openNCRs > 0 },
            { icon: '🟡', label: 'RFI', val: project.openRFIs, warn: false },
            { icon: '👷', label: 'HC', val: project.headcount, warn: false },
            { icon: '✅', label: 'SAFE DAYS', val: project.safetyDays, green: true },
            { icon: '⚠️', label: 'INCIDENTS', val: project.safetyIncidents, warn: project.safetyIncidents > 0 },
          ].map(item => (
            <div
              key={item.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: item.warn ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
                border: item.warn ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 5, padding: '3px 7px',
              }}
            >
              <span style={{ fontSize: 11 }}>{item.icon}</span>
              <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'DM Sans' }}>{item.label}</span>
              <span
                className="font-mono"
                style={{
                  fontSize: 11, fontWeight: 600,
                  color: (item as any).green ? '#22c55e' : item.warn ? '#ef4444' : '#f1f5f9',
                }}
              >
                {item.val}
              </span>
            </div>
          ))}
        </div>

        {/* Milestone Mini-Timeline */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Milestones
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {project.milestones.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <MilestoneDot m={m} />
                {i < project.milestones.length - 1 && (
                  <div
                    style={{
                      flex: 1, height: 2,
                      background: m.done ? '#f59e0b44' : 'rgba(255,255,255,0.07)',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Expanded milestone list */}
        {expanded && (
          <div
            style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 6, padding: '10px 12px', marginBottom: 14,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8, fontWeight: 600, fontFamily: 'Barlow Condensed', letterSpacing: '0.08em' }}>
              FULL MILESTONE LIST
            </div>
            {project.milestones.map((m, i) => {
              const ov = !m.done && isOverdue(m.due);
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: i < project.milestones.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: m.done ? '#f59e0b' : ov ? '#ef4444' : 'transparent',
                        border: `2px solid ${m.done ? '#f59e0b' : ov ? '#ef4444' : '#6b7280'}`,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: m.done ? '#94a3b8' : '#f1f5f9', textDecoration: m.done ? 'line-through' : 'none' }}>
                      {m.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="font-mono" style={{ fontSize: 11, color: '#6b7280' }}>{m.due}</span>
                    {m.done && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>DONE</span>}
                    {ov && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>OVERDUE</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span className="font-mono" style={{ fontSize: 11, color: '#6b7280' }}>
            {project.startDate} → {project.endDate}
          </span>
          {project.status === 'completed' ? (
            <span
              style={{
                background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700,
                fontFamily: 'Barlow Condensed', letterSpacing: '0.1em',
              }}
            >
              COMPLETED
            </span>
          ) : (
            <span
              className="font-mono"
              style={{ fontSize: 11, color: days < 0 ? '#ef4444' : days < 90 ? '#f59e0b' : '#94a3b8' }}
            >
              {days < 0 ? `${Math.abs(days)}d OVERDUE` : `${days}d remaining`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart() {
  const totalCollected = projects.reduce((s, p) => s + p.collectedToDate, 0);
  const totalPending   = projects.reduce((s, p) => s + p.pendingCollection, 0);
  const totalRetention = projects.reduce((s, p) => s + p.retentionHeld, 0);
  const total = totalCollected + totalPending + totalRetention;

  const r = 54, cx = 70, cy = 70, strokeW = 14;
  const circ = 2 * Math.PI * r;

  const segments = [
    { val: totalCollected, color: '#22c55e', label: 'Collected' },
    { val: totalPending,   color: '#f59e0b', label: 'Pending' },
    { val: totalRetention, color: '#3b82f6', label: 'Retention' },
  ];

  let offset = 0;
  const arcs = segments.map(s => {
    const dash = (s.val / total) * circ;
    const gap  = circ - dash;
    const arc  = { ...s, dash, gap, offset };
    offset += dash;
    return arc;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg width={140} height={140} viewBox="0 0 140 140">
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={strokeW}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-a.offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" fill="#f1f5f9" fontSize={12} fontFamily="Barlow Condensed" fontWeight={700}>
            SAR
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="#f59e0b" fontSize={13} fontFamily="Barlow Condensed" fontWeight={800}>
            {fmt(total)}
          </text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {segments.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                <div className="font-mono tabular" style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 500 }}>
                  {sarFmt(s.val)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Status Bar Chart ─────────────────────────────────────────────────────────
function StatusBarChart() {
  const counts: Record<string, number> = { active: 0, delayed: 0, 'on-hold': 0, completed: 0 };
  projects.forEach(p => counts[p.status]++);
  const max = Math.max(...Object.values(counts));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.entries(counts).map(([status, count]) => (
        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 72, fontSize: 10, color: '#94a3b8',
              textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
              fontFamily: 'Barlow Condensed', fontWeight: 600,
            }}
          >
            {statusLabel(status)}
          </span>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 14, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(count / max) * 100}%`,
                background: statusColor(status),
                borderRadius: 3,
                transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>
          <span className="font-mono" style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600, width: 16, textAlign: 'right' }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Top Risk Projects ─────────────────────────────────────────────────────────
function TopRisk() {
  const sorted = [...projects].sort((a, b) => (b.openNCRs + b.openRFIs) - (a.openNCRs + a.openRFIs));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map(p => (
        <div
          key={p.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '7px 10px',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 500 }}>{p.name}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <span style={{ fontSize: 10, color: '#ef4444' }}>NCR: {p.openNCRs}</span>
              <span style={{ fontSize: 10, color: '#f59e0b' }}>RFI: {p.openRFIs}</span>
            </div>
          </div>
          <StatusBadge status={p.status} />
        </div>
      ))}
    </div>
  );
}

// ─── Upcoming Milestones ──────────────────────────────────────────────────────
function UpcomingMilestones() {
  const in90 = new Date(TODAY);
  in90.setDate(in90.getDate() + 90);

  const items: { project: string; name: string; due: string; daysLeft: number; overdue: boolean }[] = [];
  projects.forEach(p => {
    p.milestones.forEach(m => {
      if (!m.done) {
        const d = new Date(m.due);
        const daysLeft = Math.ceil((d.getTime() - TODAY.getTime()) / 86400000);
        const overdue = d < TODAY;
        if (d <= in90 || overdue) {
          items.push({ project: p.name, name: m.name, due: m.due, daysLeft, overdue });
        }
      }
    });
  });

  items.sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.length === 0 && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>No upcoming milestones in 90 days.</div>
      )}
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            padding: '7px 10px',
            background: item.overdue ? 'rgba(239,68,68,0.07)' : 'rgba(0,0,0,0.2)',
            border: item.overdue ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.05)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: item.overdue ? '#ef4444' : '#f1f5f9', fontWeight: 500 }}>
                {item.name}
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{item.project}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span className="font-mono" style={{ fontSize: 11, color: item.overdue ? '#ef4444' : '#94a3b8' }}>
                {item.due}
              </span>
              {item.overdue ? (
                <span style={{
                  fontSize: 9, color: '#ef4444', fontWeight: 700,
                  background: 'rgba(239,68,68,0.15)', borderRadius: 3, padding: '1px 5px',
                  fontFamily: 'Barlow Condensed', letterSpacing: '0.08em',
                }}>
                  OVERDUE
                </span>
              ) : (
                <span style={{ fontSize: 10, color: '#f59e0b' }}>{item.daysLeft}d</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',       label: 'All',       color: '#94a3b8' },
  { key: 'active',    label: 'Active',    color: '#22c55e' },
  { key: 'delayed',   label: 'Delayed',   color: '#ef4444' },
  { key: 'on-hold',   label: 'On Hold',   color: '#f59e0b' },
  { key: 'completed', label: 'Completed', color: '#6b7280' },
];

function FilterBar({ active, onChange }: { active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FILTERS.map(f => {
        const count = f.key === 'all'
          ? projects.length
          : projects.filter(p => p.status === f.key).length;
        const isActive = active === f.key;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: isActive ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
              border: isActive ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20, padding: '5px 14px',
              color: isActive ? '#f59e0b' : '#94a3b8',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              fontFamily: 'DM Sans',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
            {f.label}
            <span
              style={{
                background: 'rgba(255,255,255,0.1)', borderRadius: 10,
                padding: '0px 6px', fontSize: 10, color: '#6b7280',
                fontFamily: 'JetBrains Mono',
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Section Heading ──────────────────────────────────────────────────────────
function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2
        className="font-display"
        style={{
          fontSize: 13, fontWeight: 700, color: '#f59e0b',
          textTransform: 'uppercase', letterSpacing: '0.12em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ display: 'inline-block', width: 3, height: 14, background: '#f59e0b', borderRadius: 2 }} />
        {title}
      </h2>
      {sub && <p style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const [filter, setFilter]     = useState('all');
  const [clock, setClock]       = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleDateString('en-SA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) +
        '  ' +
        now.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = filter === 'all'
    ? projects
    : projects.filter(p => p.status === filter);

  // KPI totals
  const kpis = {
    portfolio:  projects.reduce((s, p) => s + p.contractValue, 0),
    billed:     projects.reduce((s, p) => s + p.billedToDate, 0),
    pending:    projects.reduce((s, p) => s + p.pendingCollection, 0),
    active:     projects.filter(p => p.status === 'active').length,
    headcount:  projects.reduce((s, p) => s + p.headcount, 0),
    ncrs:       projects.reduce((s, p) => s + p.openNCRs, 0),
  };

  return (
    <>
      <FontLoader />
      <div style={{ minHeight: '100vh', background: '#0f1117', fontFamily: 'DM Sans, sans-serif' }}>

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <header
          style={{
            background: 'linear-gradient(180deg, #0d1019 0%, #0f1117 100%)',
            borderBottom: '2px solid #f59e0b',
            padding: '0 24px',
            height: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 26 }}>🦺</span>
            <div>
              <div
                className="font-display"
                style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', letterSpacing: '0.03em', lineHeight: 1 }}
              >
                Al-Rashid Contracting Co.
              </div>
              <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'Barlow Condensed' }}>
                Project Portfolio Command Center
              </div>
            </div>
          </div>
          <div
            className="font-mono"
            style={{ fontSize: 13, color: '#94a3b8', letterSpacing: '0.04em' }}
          >
            {clock}
          </div>
        </header>

        <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>

          {/* ── KPI STRIP ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            <KpiCard label="Portfolio Value"   rawValue={kpis.portfolio}  isSAR  icon="💰" />
            <KpiCard label="Total Billed"      rawValue={kpis.billed}     isSAR  icon="📋" />
            <KpiCard label="Pending Collection" rawValue={kpis.pending}   isSAR  warn icon="⏳" />
            <KpiCard label="Active Projects"   rawValue={kpis.active}     isCount icon="🏗️" />
            <KpiCard label="Total Headcount"   rawValue={kpis.headcount}  isCount icon="👷" />
            <KpiCard label="Open NCRs"         rawValue={kpis.ncrs}       isCount warn icon="🔴" />
          </div>

          {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

            {/* LEFT: Filter + Cards */}
            <div>
              {/* Filter Bar */}
              <div style={{ marginBottom: 16 }}>
                <FilterBar active={filter} onChange={setFilter} />
              </div>

              {/* Cards Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
                  gap: 16,
                }}
              >
                {filtered.map(p => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            </div>

            {/* RIGHT: Health Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Financial Donut */}
              <div
                style={{
                  background: 'linear-gradient(160deg, #161b24 0%, #131720 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: '16px 18px',
                }}
              >
                <SectionHead title="Financial Overview" />
                <DonutChart />
              </div>

              {/* Status Breakdown */}
              <div
                style={{
                  background: 'linear-gradient(160deg, #161b24 0%, #131720 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: '16px 18px',
                }}
              >
                <SectionHead title="Status Breakdown" />
                <StatusBarChart />
              </div>

              {/* Top Risk */}
              <div
                style={{
                  background: 'linear-gradient(160deg, #161b24 0%, #131720 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: '16px 18px',
                }}
              >
                <SectionHead title="Top Risk Projects" sub="Sorted by NCR + RFI count" />
                <TopRisk />
              </div>

              {/* Upcoming Milestones */}
              <div
                style={{
                  background: 'linear-gradient(160deg, #161b24 0%, #131720 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: '16px 18px',
                }}
              >
                <SectionHead title="Upcoming Milestones" sub="Next 90 days + overdue" />
                <UpcomingMilestones />
              </div>

            </div>
          </div>

          {/* ── FOOTER ─────────────────────────────────────────────── */}
          <div
            style={{
              marginTop: 32,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: '#2a3248', fontFamily: 'Barlow Condensed', letterSpacing: '0.1em' }}>
              AL-RASHID CONTRACTING CO. — PORTFOLIO COMMAND CENTER
            </span>
            <span className="font-mono" style={{ fontSize: 10, color: '#2a3248' }}>
              DATA AS OF {TODAY.toISOString().split('T')[0]}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
