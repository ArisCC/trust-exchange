'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { findBranch, REGIONS, type Region } from '@/lib/branches'
import type { ExchangeRequest, MatchProposal, TrustType } from '@/lib/types'
import { TRUST_TYPE_LABELS } from '@/lib/types'

function BoardContent() {
  const searchParams = useSearchParams()
  const myCode = searchParams.get('from') ?? ''
  const myBranch = findBranch(myCode)

  const [requests, setRequests] = useState<ExchangeRequest[]>([])
  const [myRequests, setMyRequests] = useState<ExchangeRequest[]>([])
  const [matchedBranchCounts, setMatchedBranchCounts] = useState<Map<string, number>>(new Map())
  const [trustType, setTrustType] = useState<TrustType>('disability')
  const [region, setRegion] = useState<Region | ''>('')
  const [toast, setToast] = useState('')

  const [target, setTarget] = useState<ExchangeRequest | null>(null)
  const [selectedMyReqId, setSelectedMyReqId] = useState('')
  const [proposeCount, setProposeCount] = useState(1)
  const [proposing, setProposing] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/board${myCode ? `?exclude=${myCode}` : ''}`)
    if (res.ok) setRequests(await res.json())
  }, [myCode])

  const loadMine = useCallback(async () => {
    if (!myCode) return
    const res = await fetch(`/api/branch/${myCode}`)
    if (res.ok) {
      const d = await res.json()
      setMyRequests((d.myRequests ?? []).filter((r: ExchangeRequest) => r.status === 'waiting'))
      // 累計與各分行已配對的件數
      const matched = new Map<string, number>()
      ;(d.confirmedMatches ?? []).forEach((m: MatchProposal) => {
        const peer = m.from_branch_code === myCode ? m.to_branch_code : m.from_branch_code
        matched.set(peer, (matched.get(peer) ?? 0) + m.proposed_count)
      })
      setMatchedBranchCounts(matched)
    }
  }, [myCode])

  useEffect(() => {
    load(); loadMine()
    const t = setInterval(() => { load(); loadMine() }, 10000)
    return () => clearInterval(t)
  }, [load, loadMine])

  function openPropose(req: ExchangeRequest) {
    setTarget(req)
    const targetType = req.trust_type ?? 'disability'
    const best = myRequests.find(r => (r.trust_type ?? 'disability') === targetType)
    setSelectedMyReqId(best?.id ?? '')
    setProposeCount(1)
  }

  async function submitPropose() {
    if (!target || !selectedMyReqId) return
    setProposing(true)
    const res = await fetch('/api/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_request_id: selectedMyReqId,
        to_request_id: target.id,
        proposed_count: proposeCount,
      }),
    })
    setProposing(false)
    setTarget(null)
    if (res.ok) {
      showToast(`已向 ${target.branch_name} 送出配對邀請`)
      load(); loadMine()
    } else {
      const d = await res.json()
      showToast(d.error ?? '發生錯誤')
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const byType = requests.filter(r => (r.trust_type ?? 'disability') === trustType)
  const filtered = region
    ? byType.filter(r => findBranch(r.branch_code)?.region === region)
    : byType

  const myMatchingRequests = target
    ? myRequests.filter(r => (r.trust_type ?? 'disability') === (target.trust_type ?? 'disability'))
    : myRequests
  const selectedMyReq = myMatchingRequests.find(r => r.id === selectedMyReqId)
  const maxCount = target && selectedMyReq
    ? Math.min(target.remaining_count, selectedMyReq.remaining_count)
    : 1

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 shadow-md"
        style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #1e3a7a 100%)' }}>
        <div className="max-w-lg md:max-w-5xl xl:max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-white text-base tracking-tight">配對媒合</h1>
            <p className="text-blue-300 text-xs mt-0.5">共 {requests.length} 筆等待配對</p>
          </div>
          {myBranch ? (
            <Link href={`/branch/${myCode}`}
              className="text-sm bg-white/15 hover:bg-white/25 text-white px-3.5 py-1.5 rounded-xl border border-white/20 transition-colors font-medium">
              ← {myBranch.name}
            </Link>
          ) : (
            <Link href="/" className="text-sm text-blue-300 hover:text-white transition-colors">登入分行</Link>
          )}
        </div>

        {myBranch && myRequests.length > 0 && (
          <div className="border-t border-white/10 px-4 py-2.5 max-w-lg md:max-w-5xl xl:max-w-7xl mx-auto flex items-center gap-2">
            <span className="text-xs text-blue-300">以 <strong className="text-white">{myBranch.name}</strong> 身份瀏覽・可配對件數：</span>
            {myRequests.map(r => (
              <span key={r.id} className="text-xs bg-blue-500 text-white px-2.5 py-0.5 rounded-full font-bold">
                {r.remaining_count} 件
              </span>
            ))}
          </div>
        )}
        {myBranch && myRequests.length === 0 && (
          <div className="border-t border-white/10 px-4 py-2.5 max-w-lg md:max-w-5xl xl:max-w-7xl mx-auto">
            <p className="text-xs text-amber-300">
              你目前沒有等待中的申請，
              <Link href={`/branch/${myCode}`} className="font-semibold underline text-amber-200">請先登記件數</Link>
              才能邀請配對
            </p>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-xl">
          {toast}
        </div>
      )}

      <div className="max-w-lg md:max-w-5xl xl:max-w-7xl mx-auto p-4 space-y-3">
        {/* 信託類型 tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 flex gap-1">
          {(Object.entries(TRUST_TYPE_LABELS) as [TrustType, string][]).map(([type, label]) => {
            const count = requests.filter(r => (r.trust_type ?? 'disability') === type).length
            return (
              <button
                key={type}
                onClick={() => { setTrustType(type); setRegion('') }}
                className={`flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all ${
                  trustType === type
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={trustType === type ? { background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' } : {}}>
                {label}
                <span className={`ml-1 ${trustType === type ? 'text-blue-200' : 'text-gray-400'}`}>({count})</span>
              </button>
            )
          })}
        </div>

        {/* 地區篩選 */}
        <div className="flex gap-2 flex-wrap py-1">
          <FilterBtn label={`全部 (${byType.length})`} active={region === ''} onClick={() => setRegion('')} />
          {REGIONS.map(r => {
            const count = byType.filter(req => findBranch(req.branch_code)?.region === r).length
            if (!count) return null
            return <FilterBtn key={r} label={`${r} (${count})`} active={region === r} onClick={() => setRegion(r)} />
          })}
        </div>

        {/* 清單 */}
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
            <p className="text-gray-400 text-sm">目前無等待中的申請</p>
          </div>
        )}
        {/* 桌機排成多欄，手機維持單欄堆疊 */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
        {filtered.map(r => {
          const branch = findBranch(r.branch_code)
          const canPropose = myBranch && myRequests.some(req => (req.trust_type ?? 'disability') === (r.trust_type ?? 'disability'))
          return (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-4 hover:shadow-md transition-shadow">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">{r.branch_code}</span>
                  <span className="font-bold text-gray-900">{r.branch_name}</span>
                  {branch?.region && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{branch.region}</span>
                  )}
                  {matchedBranchCounts.has(r.branch_code) && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">已配對({matchedBranchCounts.get(r.branch_code)} 件)</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-3xl font-black text-blue-600">{r.remaining_count}</span>
                  <span className="text-gray-400 text-sm">件待交換</span>
                </div>
                {r.contact_info && (
                  <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                    <span className="text-gray-400">📞</span>{r.contact_info}
                  </p>
                )}
                <p className="text-xs text-gray-300 mt-1">{new Date(r.created_at).toLocaleDateString('zh-TW')} 登記</p>
              </div>
              <div className="shrink-0">
                {canPropose ? (
                  <button
                    onClick={() => openPropose(r)}
                    className="text-white font-semibold px-4 py-2.5 rounded-xl text-sm whitespace-nowrap shadow-sm transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
                    邀請配對
                  </button>
                ) : (
                  <div className="text-center">
                    {!myBranch ? (
                      <Link href="/" className="block text-xs text-blue-600 hover:underline text-center leading-relaxed">
                        登入<br />後配對
                      </Link>
                    ) : (
                      <Link href={`/branch/${myCode}`} className="block text-xs text-amber-600 hover:underline text-center leading-relaxed">
                        先登記<br />件數
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        </div>
      </div>

      {/* 配對 Modal */}
      {target && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-5 py-5 text-white" style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #1e3a7a 100%)' }}>
              <p className="text-blue-300 text-xs font-medium mb-1">送出配對邀請</p>
              <p className="font-bold text-xl">{target.branch_name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-blue-300 text-sm">對方剩餘</span>
                <span className="text-white font-bold">{target.remaining_count} 件</span>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {myMatchingRequests.length > 1 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">使用哪筆申請</label>
                  <div className="space-y-2">
                    {myMatchingRequests.map(r => (
                      <label key={r.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 cursor-pointer transition-colors ${selectedMyReqId === r.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                        <input type="radio" name="myReq" value={r.id} checked={selectedMyReqId === r.id}
                          onChange={() => {
                            setSelectedMyReqId(r.id)
                            setProposeCount(Math.min(target.remaining_count, r.remaining_count))
                          }} className="accent-blue-600" />
                        <span className="text-sm font-semibold text-gray-800">剩餘 {r.remaining_count} 件</span>
                        {r.contact_info && <span className="text-xs text-gray-400">{r.contact_info}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  交換件數
                  <span className="text-gray-400 font-normal ml-1 text-xs">（最多 {maxCount} 件）</span>
                </label>
                <div className="flex items-center justify-center gap-5">
                  <button onClick={() => setProposeCount(c => Math.max(1, c - 1))}
                    className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 text-xl font-bold text-gray-600 flex items-center justify-center transition-colors">−</button>
                  <span className="text-4xl font-black text-blue-600 w-16 text-center tabular-nums">{proposeCount}</span>
                  <button onClick={() => setProposeCount(c => Math.min(maxCount, c + 1))}
                    className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 text-xl font-bold text-gray-600 flex items-center justify-center transition-colors">＋</button>
                </div>
                <input type="range" min={1} max={maxCount} value={proposeCount}
                  onChange={e => setProposeCount(Number(e.target.value))}
                  className="w-full mt-4 accent-blue-600" />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setTarget(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-2xl transition-colors">
                  取消
                </button>
                <button onClick={submitPropose} disabled={proposing || !selectedMyReqId}
                  className="flex-1 text-white font-bold py-3 rounded-2xl transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
                  {proposing ? '送出中…' : `送出 (${proposeCount} 件)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
        active
          ? 'text-white shadow-sm'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
      }`}
      style={active ? { background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' } : {}}>
      {label}
    </button>
  )
}

export default function BoardPage() {
  return (
    <Suspense>
      <BoardContent />
    </Suspense>
  )
}
