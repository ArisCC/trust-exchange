'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { searchBranches, findBranch, type Branch } from '@/lib/branches'
import Link from 'next/link'

export default function Home() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Branch | null>(null)
  const [suggestions, setSuggestions] = useState<Branch[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleQueryChange(value: string) {
    setQuery(value)
    setSelected(null)
    const exact = findBranch(value.trim())
    if (exact) {
      setSelected(exact)
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    const results = searchBranches(value)
    setSuggestions(results)
    setShowDropdown(results.length > 0)
  }

  function selectBranch(branch: Branch) {
    setSelected(branch)
    setQuery(`${branch.code} ${branch.name}`)
    setShowDropdown(false)
    setSuggestions([])
  }

  function handleEnter() {
    if (selected) router.push(`/branch/${selected.code}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 gap-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #0a2a6e 50%, #0f1f3d 100%)' }}>

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
      </div>

      {/* Logo & Title */}
      <div className="text-center relative">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg"
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">信託案件交換平台</h1>
        <p className="text-blue-300 mt-1.5 text-sm">提供身心障礙信託、一般預開信託及安養信託案件交換媒合</p>
      </div>

      {/* Steps */}
      <div className="flex gap-3 w-full max-w-lg">
        {[
          { step: '1', text: '輸入分行代號進入主頁' },
          { step: '2', text: '登記想交換的件數' },
          { step: '3', text: '到配對媒合頁找其他分行' },
        ].map(s => (
          <div key={s.step} className="flex-1 rounded-2xl px-3 py-4 text-center border border-white/10"
            style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(10px)' }}>
            <div className="w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center mx-auto mb-2 text-white"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}>
              {s.step}
            </div>
            <p className="text-xs text-blue-100 leading-tight">{s.text}</p>
          </div>
        ))}
      </div>

      {/* Login card */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          分行代號或名稱
        </label>
        <div ref={containerRef} className="relative">
          <input
            type="text"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onKeyDown={e => e.key === 'Enter' && handleEnter()}
            placeholder="輸入代號（如 005）或分行名稱（如 台北）"
            maxLength={20}
            autoComplete="off"
            className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3.5 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-blue-500 text-base bg-gray-50 focus:bg-white transition-colors"
          />

          {showDropdown && (
            <ul className="absolute z-10 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
              {suggestions.map(b => (
                <li
                  key={b.code}
                  onMouseDown={() => selectBranch(b)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <span className="text-sm font-mono font-bold text-blue-600 w-8">{b.code}</span>
                  <span className="text-gray-800 font-medium">{b.name}</span>
                  <span className="text-xs text-gray-400 ml-auto bg-gray-100 px-2 py-0.5 rounded-full">{b.region}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="mt-3 flex items-center gap-2 text-green-600 bg-green-50 rounded-xl px-3 py-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">{selected.name}</span>
            <span className="text-xs text-green-500 ml-1">{selected.region}</span>
          </div>
        )}

        <button
          onClick={handleEnter}
          disabled={!selected}
          className="mt-4 w-full text-white font-bold py-3.5 rounded-2xl transition-all text-base disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: selected ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#e5e7eb', color: selected ? 'white' : '#9ca3af' }}
        >
          {selected ? `進入 ${selected.name} →` : '請先選擇分行'}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 relative">
        <Link href="/board" className="text-sm text-blue-300 hover:text-white transition-colors">
          直接瀏覽配對媒合 →
        </Link>
        <Link href="/admin" className="text-xs text-white/20 hover:text-white/40 transition-colors mt-2">
          管理者
        </Link>
      </div>
    </main>
  )
}
