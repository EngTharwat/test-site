'use client'

import { useState, useEffect, useCallback } from 'react'
import { use } from 'react'
import { api } from '@/lib/api'

interface Card {
  id: string
  title: string
  description: string
}

interface List {
  id: string
  title: string
  cards?: Card[]
}

interface Board {
  id: string
  title: string
}

export default function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = use(params)
  const [board, setBoard] = useState<Board | null>(null)
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(true)
  const [newListTitle, setNewListTitle] = useState('')
  const [addingList, setAddingList] = useState(false)
  const [showListForm, setShowListForm] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({})
  const [showCardForm, setShowCardForm] = useState<Record<string, boolean>>({})

  const fetchAll = useCallback(async () => {
    try {
      const [boardData, listsData] = await Promise.all([
        api.get(`/api/boards/${boardId}`),
        api.get(`/api/boards/${boardId}/lists`),
      ])
      setBoard(boardData)

      const listsWithCards = await Promise.all(
        listsData.map(async (list: List) => {
          const cards = await api.get(`/api/boards/${boardId}/lists/${list.id}/cards`)
          return { ...list, cards }
        })
      )
      setLists(listsWithCards)
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function addList(e: React.FormEvent) {
    e.preventDefault()
    if (!newListTitle.trim()) return
    setAddingList(true)
    try {
      const list = await api.post(`/api/boards/${boardId}/lists`, { title: newListTitle })
      setLists((prev) => [...prev, { ...list, cards: [] }])
      setNewListTitle('')
      setShowListForm(false)
    } finally {
      setAddingList(false)
    }
  }

  async function addCard(e: React.FormEvent, listId: string) {
    e.preventDefault()
    const title = newCardTitle[listId]
    if (!title?.trim()) return
    const card = await api.post(`/api/boards/${boardId}/lists/${listId}/cards`, { title })
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId ? { ...l, cards: [...(l.cards ?? []), card] } : l
      )
    )
    setNewCardTitle((prev) => ({ ...prev, [listId]: '' }))
    setShowCardForm((prev) => ({ ...prev, [listId]: false }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">{board?.title}</h2>

      <div className="flex gap-4 items-start overflow-x-auto pb-4">
        {lists.map((list) => (
          <div key={list.id} className="bg-gray-100 rounded-xl p-3 w-64 shrink-0">
            <h3 className="font-semibold text-sm text-gray-700 mb-3 px-1">{list.title}</h3>

            <div className="flex flex-col gap-2 mb-3">
              {(list.cards ?? []).map((card) => (
                <div
                  key={card.id}
                  className="bg-white rounded-lg px-3 py-2 text-sm shadow-sm border border-gray-200"
                >
                  {card.title}
                </div>
              ))}
            </div>

            {showCardForm[list.id] ? (
              <form onSubmit={(e) => addCard(e, list.id)} className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  rows={2}
                  value={newCardTitle[list.id] ?? ''}
                  onChange={(e) =>
                    setNewCardTitle((prev) => ({ ...prev, [list.id]: e.target.value }))
                  }
                  placeholder="Card title…"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add card
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShowCardForm((prev) => ({ ...prev, [list.id]: false }))
                    }
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() =>
                  setShowCardForm((prev) => ({ ...prev, [list.id]: true }))
                }
                className="w-full text-left text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg px-2 py-1.5 transition-colors"
              >
                + Add a card
              </button>
            )}
          </div>
        ))}

        {/* Add list */}
        <div className="w-64 shrink-0">
          {showListForm ? (
            <form
              onSubmit={addList}
              className="bg-gray-100 rounded-xl p-3 flex flex-col gap-2"
            >
              <input
                autoFocus
                type="text"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="List name…"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addingList}
                  className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {addingList ? 'Adding…' : 'Add list'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowListForm(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowListForm(true)}
              className="w-full bg-white/70 hover:bg-white text-gray-600 text-sm font-medium rounded-xl px-4 py-3 text-left transition-colors border border-gray-200"
            >
              + Add a list
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
