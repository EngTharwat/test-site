'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Board {
  id: string
  title: string
  description: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const fetchBoards = useCallback(async () => {
    try {
      const data = await api.get('/api/boards')
      setBoards(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load boards.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBoards() }, [fetchBoards])

  async function createBoard(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const board = await api.post('/api/boards', { title: newTitle })
      setBoards((prev) => [board, ...prev])
      setNewTitle('')
      setShowForm(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create board.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Your Boards</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New Board
        </button>
      </div>

      {showForm && (
        <form onSubmit={createBoard} className="mb-6 flex gap-2">
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Board name…"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-sm text-gray-500 px-3 py-2 hover:text-gray-700"
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : boards.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No boards yet</p>
          <p className="text-sm">Click "+ New Board" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => router.push(`/board/${board.id}`)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 text-left transition-colors min-h-[80px]"
            >
              <span className="font-semibold text-sm">{board.title}</span>
              {board.description && (
                <p className="text-xs text-blue-200 mt-1 line-clamp-2">{board.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
