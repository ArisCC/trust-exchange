'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { ExchangeRequest, MatchProposal } from '@/lib/supabase'
import { TRUST_TYPE_LABELS } from '@/lib/supabase'

type Stats = {
  totalRequests: number
  waitingRequests: number
  completedRequests: number
  totalMatches: number
  recentMatches: MatchProposal[]
  activeBranches: { code: string; name: string; count: number }[]
}

type MainTab = 'stats' | 'requests' | 'proposals'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<MainTab>('stats')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) setAuthed(true)
    else setLoginError('密碼錯誤')
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
          <h1 className="text-xl font-bold text-gray-800 mb-1">管理者登入</h1>
          <p className="text-sm text-gray-500 mb-6">信託案件交換平台</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
              登入
            </button>
          </form>
          <Link href="/" className="block text-center mt-4 text-sm text-gray-400 hover:text-gray-600">← 返回</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">管理者儀表板</h1>
            <p className="text-xs text-gray-500">身心障礙預開式信託 · 案件交換</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">← 返回</Link>
        </div>

        <div className="max-w-3xl mx-auto mt-3 flex gap-1">
          {([
            { key: 'stats', label: '統計總覽' },
            { key: 'requests', label: '申請管理' },
            { key: 'proposals', label: '配對管理' },
          ] as { key: MainTab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {tab === 'stats' && <StatsTab />}
        {tab === 'requests' && <RequestsTab />}
        {tab === 'proposals' && <ProposalsTab />}
      </div>
    </main>
  )
}

function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState<{ requests: number; proposals: number } | null>(null)
  const [confirmStep, setConfirmStep] = useState(0) // 0=idle, 1=first confirm, 2=second confirm

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats)
    const t = setInterval(() => fetch('/api/admin/stats').then(r => r.json()).then(setStats), 30000)
    return () => clearInterval(t)
  }, [])

  async function handleReset() {
    setResetting(true)
    setConfirmStep(0)
    const res = await fetch('/api/admin/reset-year', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setResetResult(data.reset)
      fetch('/api/admin/stats').then(r => r.json()).then(setStats)
    }
    setResetting(false)
  }

  if (!stats) return <Spinner />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="總申請數" value={stats.totalRequests} color="blue" />
        <StatCard label="配對成功" value={stats.totalMatches} color="green" />
        <StatCard label="等待中" value={stats.waitingRequests} color="yellow" />
        <StatCard label="已完成" value={stats.completedRequests} color="gray" />
      </div>

      {stats.activeBranches.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-3">最活躍分行</h2>
          <div className="space-y-2">
            {stats.activeBranches.map((b, i) => (
              <div key={b.code} className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-gray-700">{b.name}</span>
                    <span className="text-sm font-semibold text-blue-600">{b.count} 次</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(b.count / stats.activeBranches[0].count) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="font-semibold text-gray-800">最近配對紀錄</h2>
        </div>
        {stats.recentMatches.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">尚無配對紀錄</p>
        )}
        {stats.recentMatches.map((m, i) => (
          <div key={m.id} className={`flex items-center justify-between px-5 py-3 ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
            <div className="text-sm text-gray-700">
              <span className="font-medium">{m.from_branch_name}</span>
              <span className="text-gray-400 mx-2">⇄</span>
              <span className="font-medium">{m.to_branch_name}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-blue-600">{m.proposed_count} 件</p>
              <p className="text-xs text-gray-400">{m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString('zh-TW') : ''}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Year Reset */}
      <div className="border-2 border-red-200 rounded-2xl p-5 bg-red-50">
        <h2 className="font-bold text-red-700 mb-1">跨年度重置</h2>
        <p className="text-sm text-red-600 mb-4">
          將所有「等待中」和「已完成」申請、以及所有「待確認」和「已確認」配對一律標記為已取消，讓各分行從零開始登記新年度。<br />
          <span className="font-semibold">歷史紀錄仍會保留，但無法復原。</span>
        </p>

        {resetResult ? (
          <div className="bg-white border border-red-200 rounded-xl p-4 text-sm text-gray-700">
            重置完成：已關閉 <span className="font-bold text-red-600">{resetResult.requests}</span> 筆申請、
            <span className="font-bold text-red-600">{resetResult.proposals}</span> 筆配對。
            <button onClick={() => setResetResult(null)} className="ml-3 text-gray-400 hover:text-gray-600 underline text-xs">關閉</button>
          </div>
        ) : confirmStep === 0 ? (
          <button
            onClick={() => setConfirmStep(1)}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm"
          >
            執行年度重置
          </button>
        ) : confirmStep === 1 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-red-700">確定要重置所有年度資料嗎？</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmStep(2)}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-xl text-sm"
              >
                是，我確定
              </button>
              <button
                onClick={() => setConfirmStep(0)}
                className="bg-white border border-gray-300 text-gray-600 font-medium px-5 py-2 rounded-xl text-sm"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-red-700">最後確認：此操作不可復原，確定執行？</p>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-sm"
              >
                {resetting ? '重置中…' : '確認執行重置'}
              </button>
              <button
                onClick={() => setConfirmStep(0)}
                className="bg-white border border-gray-300 text-gray-600 font-medium px-5 py-2 rounded-xl text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RequestsTab() {
  const [requests, setRequests] = useState<ExchangeRequest[]>([])
  const [statusFilter, setStatusFilter] = useState('waiting')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: statusFilter })
    if (q) params.set('q', q)
    const res = await fetch(`/api/admin/requests?${params}`)
    if (res.ok) setRequests(await res.json())
    setLoading(false)
  }, [statusFilter, q])

  useEffect(() => { load() }, [load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleCancel(id: string) {
    const res = await fetch(`/api/request/${id}`, { method: 'DELETE' })
    setConfirmingId(null)
    if (res.ok) { showToast('已取消申請'); load() }
    else showToast('操作失敗')
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-lg">{toast}</div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder="搜尋分行名稱或代號"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {['waiting', 'completed', 'cancelled', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {{ waiting: '等待中', completed: '已完成', cancelled: '已取消', all: '全部' }[s]}
          </button>
        ))}
      </div>

      {loading && <Spinner />}
      {!loading && requests.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">無資料</p>
      )}
      {requests.map(r => (
        <div key={r.id} className="bg-white rounded-xl shadow-sm p-4 gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{r.branch_code}</span>
                <span className="font-semibold text-gray-900">{r.branch_name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{TRUST_TYPE_LABELS[r.trust_type ?? 'disability']}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r.status === 'waiting' ? 'bg-yellow-100 text-yellow-700' :
                  r.status === 'completed' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{r.status === 'waiting' ? '等待中' : r.status === 'completed' ? '已完成' : '已取消'}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {r.requested_count} 件登記・剩餘 {r.remaining_count} 件
                {r.contact_info && <span className="ml-2 text-gray-400">📞 {r.contact_info}</span>}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(r.created_at).toLocaleDateString('zh-TW')} 登記</p>
            </div>
            {r.status === 'waiting' && confirmingId !== r.id && (
              <button onClick={() => setConfirmingId(r.id)}
                className="shrink-0 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg">
                強制取消
              </button>
            )}
          </div>
          {confirmingId === r.id && (
            <div className="mt-3 pt-3 border-t border-red-100 flex items-center gap-2">
              <p className="text-sm text-red-600 flex-1">確定強制取消？所有已配對件數將還回。</p>
              <button onClick={() => handleCancel(r.id)}
                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold">確定</button>
              <button onClick={() => setConfirmingId(null)}
                className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg">取消</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ProposalsTab() {
  const [type, setType] = useState<'confirmed' | 'pending'>('confirmed')
  const [proposals, setProposals] = useState<MatchProposal[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/proposals?type=${type}`)
    if (res.ok) setProposals(await res.json())
    setLoading(false)
  }, [type])

  useEffect(() => { load() }, [load])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleForceCancel(id: string) {
    const res = await fetch(`/api/admin/match/${id}/force-cancel`, { method: 'POST' })
    setConfirmingId(null)
    if (res.ok) { showToast('已強制取消配對'); load() }
    else showToast('操作失敗')
  }

  async function handleReject(id: string) {
    const res = await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: id, action: 'reject' }),
    })
    setConfirmingId(null)
    if (res.ok) { showToast('已拒絕提案'); load() }
    else showToast('操作失敗')
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-lg">{toast}</div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setType('confirmed')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${type === 'confirmed' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          已確認配對
        </button>
        <button onClick={() => setType('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${type === 'pending' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
          待確認邀請
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && proposals.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">無資料</p>
      )}
      {proposals.map(p => (
        <div key={p.id} className="bg-white rounded-xl shadow-sm p-4 gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-gray-900">{p.from_branch_name}</span>
                <span className="text-gray-400">{type === 'confirmed' ? '⇄' : '→'}</span>
                <span className="font-semibold text-gray-900">{p.to_branch_name}</span>
              </div>
              <p className="text-blue-600 font-bold mt-0.5">{p.proposed_count} 件</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {type === 'confirmed'
                  ? `配對日：${p.confirmed_at ? new Date(p.confirmed_at).toLocaleDateString('zh-TW') : '-'}`
                  : `提案日：${new Date(p.created_at).toLocaleDateString('zh-TW')}`}
              </p>
            </div>
            {confirmingId !== p.id && (
              type === 'confirmed' ? (
                <button onClick={() => setConfirmingId(p.id)}
                  className="shrink-0 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg">
                  強制取消
                </button>
              ) : (
                <button onClick={() => setConfirmingId(p.id)}
                  className="shrink-0 text-sm text-orange-500 hover:text-orange-700 border border-orange-200 hover:border-orange-400 px-3 py-1.5 rounded-lg">
                  強制拒絕
                </button>
              )
            )}
          </div>
          {confirmingId === p.id && (
            <div className="mt-3 pt-3 border-t border-red-100 flex items-center gap-2">
              <p className="text-sm text-red-600 flex-1">
                {type === 'confirmed' ? '確定強制取消？雙方件數將還回。' : '確定強制拒絕此提案？'}
              </p>
              <button onClick={() => type === 'confirmed' ? handleForceCancel(p.id) : handleReject(p.id)}
                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold">確定</button>
              <button onClick={() => setConfirmingId(null)}
                className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg">取消</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    gray: 'bg-gray-50 text-gray-700',
  }
  return (
    <div className={`rounded-2xl p-4 ${colors[color]}`}>
      <p className="text-sm opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
