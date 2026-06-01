'use client'

// Animated modal showing upload/import progress with a live percentage.
export interface UploadState {
  open:     boolean
  title:    string
  total:    number
  done:     number
  ok:       number
  fail:     number
  finished: boolean
}

export const initialUpload: UploadState = {
  open: false, title: '', total: 0, done: 0, ok: 0, fail: 0, finished: false,
}

export function UploadProgressModal({ state, onClose }: {
  state: UploadState
  onClose: () => void
}) {
  if (!state.open) return null
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-sm p-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          {!state.finished ? (
            <span className="inline-block w-5 h-5 border-2 border-[#2563FF] border-t-transparent rounded-full animate-spin" />
          ) : state.fail === 0 ? (
            <span className="text-xl">✅</span>
          ) : (
            <span className="text-xl">⚠️</span>
          )}
          <h3 className="text-[15px] font-bold text-black dark:text-white">
            {state.finished ? 'Done' : state.title}
          </h3>
        </div>

        {/* Big percentage */}
        <div className="text-center mb-3">
          <span className="text-4xl font-bold tracking-[-1px] text-black dark:text-white tabular-nums">{pct}%</span>
        </div>

        {/* Animated bar */}
        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-4">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${pct}%`,
              background: state.finished && state.fail > 0
                ? 'linear-gradient(90deg,#f97316,#ef4444)'
                : 'linear-gradient(90deg,#2563FF,#22c55e)',
            }}
          />
        </div>

        {/* Details */}
        <div className="grid grid-cols-3 gap-2 text-center mb-5">
          <div>
            <div className="text-[18px] font-bold text-black dark:text-white tabular-nums">{state.done}/{state.total}</div>
            <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Processed</div>
          </div>
          <div>
            <div className="text-[18px] font-bold text-green-600 dark:text-green-400 tabular-nums">{state.ok}</div>
            <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Saved</div>
          </div>
          <div>
            <div className="text-[18px] font-bold text-red-500 tabular-nums">{state.fail}</div>
            <div className="text-[10px] text-[#6B7280] dark:text-gray-400 uppercase tracking-wider">Failed</div>
          </div>
        </div>

        {state.finished ? (
          <button onClick={onClose}
            className="w-full bg-black dark:bg-white text-white dark:text-black text-sm font-semibold py-2.5 rounded-lg hover:bg-[#0F1115] dark:hover:bg-gray-100 transition-colors">
            Close
          </button>
        ) : (
          <p className="text-center text-[12px] text-[#6B7280] dark:text-gray-400 animate-pulse">
            Please wait — writing to the database…
          </p>
        )}
      </div>
    </div>
  )
}
