'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { findBranch } from '@/lib/branches'
import type { BranchContact, ExchangeRequest, MatchProposal, TrustType } from '@/lib/types'
import { TRUST_TYPE_LABELS } from '@/lib/types'

type DashboardData = {
  contact: BranchContact
  exchanged: { branch_code: string; trust_type: string; count: number }[]
  myRequests: ExchangeRequest[]
  incomingProposals: MatchProposal[]
  outgoingProposals: MatchProposal[]
  confirmedMatches: MatchProposal[]
  pastHistory: MatchProposal[]
}

export default function BranchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const branch = findBranch(code)
  const [data, setData] = useState<DashboardData | null>(null)
  const [trustType, setTrustType] = useState<TrustType>('disability')
  const [caseCount, setCaseCount] = useState('')
  const [customerCount, setCustomerCount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'requests' | 'proposals' | 'history'>('requests')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/branch/${code}`)
    if (res.ok) setData(await res.json())
  }, [code])

  useEffect(() => {
    if (!branch) { router.replace('/'); return }
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [branch, load, router])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_code: code,
        branch_name: branch!.name,
        trust_type: trustType,
        case_count: parseInt(caseCount),
        customer_count: customerCount ? parseInt(customerCount) : null,
      }),
    })
    setCaseCount('')
    setCustomerCount('')
    setSubmitting(false)
    load()
  }

  async function handleSaveContact(contactInfo: string, email: string) {
    const res = await fetch(`/api/branch/${code}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_info: contactInfo || null, notification_email: email || null }),
    })
    const d = await res.json()
    if (!res.ok) { showToast(d.error ?? '儲存失敗'); return false }
    showToast('已更新分行聯絡方式')
    load()
    return true
  }

  async function handleProposal(proposalId: string, action: 'confirm' | 'reject') {
    if (processingId) return
    setProcessingId(proposalId)
    const res = await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: proposalId, action }),
    })
    const d = await res.json()
    if (!res.ok) showToast(d.error ?? '發生錯誤')
    else showToast(action === 'confirm' ? '已確認配對' : '已拒絕邀請')
    setProcessingId(null)
    load()
  }

  async function handleEdit(requestId: string, newCount: number, newCustomers: number | null) {
    const res = await fetch(`/api/request/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_count: newCount, customer_count: newCustomers }),
    })
    const d = await res.json()
    if (!res.ok) showToast(d.error ?? '編輯失敗')
    else showToast('已更新')
    load()
  }

  async function handleCancel(requestId: string) {
    await fetch(`/api/request/${requestId}`, { method: 'DELETE' })
    showToast('已取消申請')
    load()
  }

  async function handleCancelRequest(matchId: string) {
    const res = await fetch(`/api/match/${matchId}/cancel-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_code: code }),
    })
    const d = await res.json()
    if (!res.ok) showToast(d.error ?? '操作失敗')
    else showToast('已送出取消申請，等待對方確認')
    load()
  }

  async function handleCancelConfirm(matchId: string, action: 'approve' | 'reject' | 'withdraw') {
    const res = await fetch(`/api/match/${matchId}/cancel-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_code: code, action }),
    })
    const d = await res.json()
    if (!res.ok) showToast(d.error ?? '操作失敗')
    else {
      if (action === 'approve') showToast('已同意取消，件數已還回')
      else if (action === 'reject') showToast('已拒絕取消申請')
      else showToast('已撤回取消申請')
    }
    load()
  }

  if (!branch) return null
  if (!data) return <LoadingScreen />

  const waitingRequests = data.myRequests.filter(r => r.status === 'waiting')
  const activeRequests = data.myRequests.filter(r => r.status !== 'cancelled')
  const cancelledRequests = data.myRequests.filter(r => r.status === 'cancelled')
  const pendingIn = data.incomingProposals.length
  const pendingCancelIn = data.confirmedMatches.filter(
    m => m.cancel_status === 'pending' && m.cancel_requested_by !== code
  ).length
  const proposalBadge = pendingIn + pendingCancelIn

  /**
   * 我方與某分行、某信託類型已經換掉的件數。
   * 後端的 exchanged 已含待確認的提案，所以要扣掉「當前這筆」才不會重複計算。
   */
  function exchangedWith(branchCode: string, trustType: string | undefined, excludeProposalId: string) {
    if (!trustType) return 0
    const total = data!.exchanged.find(
      e => e.branch_code === branchCode && e.trust_type === trustType
    )?.count ?? 0
    const self = [...data!.incomingProposals, ...data!.outgoingProposals]
      .find(p => p.id === excludeProposalId)?.proposed_count ?? 0
    return Math.max(0, total - self)
  }

  const totalRequested = activeRequests.reduce((s, r) => s + r.requested_count, 0)
  const totalMatched = activeRequests.reduce((s, r) => s + (r.requested_count - r.remaining_count), 0)
  const totalRemaining = activeRequests.reduce((s, r) => s + r.remaining_count, 0)

  // 兩套版面（手機／桌機）共用同一份內容，避免維護兩份
  const stepGuide = (
    <>
        {/* 步驟引導 */}
        {waitingRequests.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-emerald-700 font-bold text-sm">
                已登記 {waitingRequests.reduce((s, r) => s + r.remaining_count, 0)} 件等待交換
              </p>
              <p className="text-emerald-600 text-xs mt-0.5">前往配對媒合，找其他分行配對</p>
            </div>
            <Link
              href={`/board?from=${code}`}
              className="shrink-0 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
              去找配對 →
            </Link>
          </div>
        ) : activeRequests.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-4">
            <p className="text-blue-700 font-bold text-sm">所有件數已配對完成</p>
            <p className="text-blue-500 text-xs mt-0.5">可在下方查看配對紀錄</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-gray-700 font-bold text-sm">第一步：登記想交換的件數</p>
            <p className="text-gray-500 text-xs mt-0.5">登記後，再去配對媒合找其他分行配對</p>
          </div>
        )}
    </>
  )
  const registerBlock = (
    <>
        {/* 登記表單 */}
        {activeRequests.length === 0 || showForm ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">
                {activeRequests.length === 0 ? '登記交換申請' : '新增申請'}
              </h2>
              {activeRequests.length > 0 && (
                <button onClick={() => setShowForm(false)} className="text-xs text-gray-400 hover:text-gray-600">收合</button>
              )}
            </div>
            <RegisterForm
              trustType={trustType} setTrustType={setTrustType}
              caseCount={caseCount} setCaseCount={setCaseCount}
              customerCount={customerCount} setCustomerCount={setCustomerCount}
              submitting={submitting} onSubmit={async e => { await handleSubmit(e); setShowForm(false) }}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-white rounded-2xl shadow-sm border border-dashed border-gray-200 py-4 text-sm font-semibold text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors">
            ＋ 新增另一類型申請
          </button>
        )}
    </>
  )
  const tabsBlock = (
    <>
        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {[
              { key: 'requests', label: '我的申請', badge: 0 },
              { key: 'proposals', label: '待處理', badge: proposalBadge },
              { key: 'history', label: '歷史紀錄', badge: 0 },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as typeof tab)}
                className={`flex-1 py-3.5 text-sm font-semibold transition-colors relative ${
                  tab === t.key ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {t.label}
                {t.badge > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{t.badge}</span>
                )}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-blue-600" />
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* 我的申請 */}
            {tab === 'requests' && (
              <div className="space-y-4">
                {activeRequests.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">尚未登記任何申請</p>
                )}
                {activeRequests.map(r => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    confirmedMatches={data.confirmedMatches.filter(
                      m => m.from_request_id === r.id || m.to_request_id === r.id
                    )}
                    myCode={code}
                    onEdit={handleEdit}
                    onCancel={handleCancel}
                    onCancelRequest={handleCancelRequest}
                    onCancelConfirm={handleCancelConfirm}
                  />
                ))}
              </div>
            )}

            {/* 待處理 */}
            {tab === 'proposals' && (
              <div className="space-y-3">
                {data.confirmedMatches.filter(
                  m => m.cancel_status === 'pending' && m.cancel_requested_by !== code
                ).map(m => (
                  <div key={m.id} className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-xs font-bold text-amber-700 mb-2">⚠️ 對方申請取消配對</p>
                    <p className="text-sm font-bold text-gray-900">
                      {m.from_branch_code === code ? m.to_branch_name : m.from_branch_name}
                    </p>
                    <p className="text-amber-700 font-bold mt-0.5 text-sm">交換 {m.proposed_count} 件</p>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleCancelConfirm(m.id, 'approve')}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2 rounded-xl transition-colors">
                        同意取消
                      </button>
                      <button
                        onClick={() => handleCancelConfirm(m.id, 'reject')}
                        className="flex-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 text-sm py-2 rounded-xl transition-colors">
                        拒絕
                      </button>
                    </div>
                  </div>
                ))}

                {data.incomingProposals.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-2 px-1">收到的配對邀請</p>
                    {data.incomingProposals.map(p => (
                      <ProposalCard key={p.id} proposal={p} incoming onAction={handleProposal} processingId={processingId}
                        myRequest={data.myRequests.find(r => r.id === p.to_request_id)}
                        alreadyExchanged={exchangedWith(p.from_branch_code, data.myRequests.find(r => r.id === p.to_request_id)?.trust_type, p.id)} />
                    ))}
                  </>
                )}

                {data.outgoingProposals.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-4 px-1">我送出的邀請</p>
                    {data.outgoingProposals.map(p => (
                      <ProposalCard key={p.id} proposal={p} incoming={false} onAction={handleProposal} processingId={processingId}
                        myRequest={data.myRequests.find(r => r.id === p.from_request_id)}
                        alreadyExchanged={exchangedWith(p.to_branch_code, data.myRequests.find(r => r.id === p.from_request_id)?.trust_type, p.id)} />
                    ))}
                  </>
                )}

                {proposalBadge === 0 && data.outgoingProposals.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">目前無待處理項目</p>
                )}
              </div>
            )}

            {/* 歷史紀錄 */}
            {tab === 'history' && (
              <div className="space-y-2">
                {data.pastHistory.length === 0 && cancelledRequests.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">尚無歷史紀錄</p>
                )}

                {/* 已撤下的登記也要留痕跡，否則使用者只會看到東西憑空消失 */}
                {cancelledRequests.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">已撤下的登記</p>
                    {cancelledRequests.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div>
                          <p className="font-semibold text-gray-800">
                            {TRUST_TYPE_LABELS[r.trust_type]}
                            <span className="text-gray-400 text-xs font-normal ml-2">{r.requested_count} 件</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(r.updated_at).toLocaleDateString('zh-TW')} 撤下
                          </p>
                        </div>
                        <span className="text-xs px-3 py-1.5 rounded-full font-bold bg-gray-200 text-gray-500">
                          已撤下
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {data.pastHistory.length > 0 && (
                  <>
                    {cancelledRequests.length > 0 && (
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1 pt-3">配對紀錄</p>
                    )}
                    {data.pastHistory.map(p => (
                      <PastHistoryCard key={p.id} proposal={p} myCode={code} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
    </>
  )

  return (
    <main className="min-h-screen bg-slate-50">

      {/* ── 桌機：以「頁首資訊帶 + 橫向操作條 + 主清單」組織，不做左右切割 ── */}
      <div className="hidden lg:block min-h-screen bg-slate-100">
        <header className="shadow-lg" style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #1e3a7a 100%)' }}>
          <div className="max-w-[1200px] mx-auto px-10 pt-6 pb-7">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <Link href="/" className="w-11 h-11 rounded-2xl grid place-items-center shadow-md shrink-0"
                  style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </Link>
                <div>
                  <p className="text-blue-300 text-xs font-medium">代號 {code}・{branch.region}</p>
                  <h1 className="text-3xl font-black text-white tracking-tight leading-tight">{branch.name}</h1>
                </div>
              </div>
              {waitingRequests.length > 0 && (
                <Link href={`/board?from=${code}`}
                  className="text-white font-bold px-5 py-3 rounded-xl shadow-md transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
                  去配對媒合找分行 →
                </Link>
              )}
            </div>

            {/* 統計橫向鋪滿頁首 */}
            {activeRequests.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { n: totalRequested, label: '登記件數', c: 'text-white', bg: 'rgba(255,255,255,0.1)' },
                  { n: totalMatched, label: '已配對', c: 'text-emerald-300', bg: 'rgba(16,185,129,0.18)' },
                  { n: totalRemaining, label: '待配對', c: 'text-amber-300', bg: 'rgba(245,158,11,0.18)' },
                ].map(x => (
                  <div key={x.label} className="rounded-2xl px-5 py-4 flex items-baseline gap-3" style={{ background: x.bg }}>
                    <span className={`text-4xl font-black tabular-nums ${x.c}`}>{x.n}</span>
                    <span className="text-sm text-blue-200">{x.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="max-w-[1200px] mx-auto px-10 py-6 space-y-4">
          {/* 聯絡方式與新增：橫向操作條 */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-stretch">
            <ContactCard contact={data.contact} onSave={handleSaveContact} />
            <div className="flex">{registerBlock}</div>
          </div>

          {tabsBlock}
        </div>
      </div>

      {/* ── 手機版（以下維持原樣） ── */}
      <div className="lg:hidden">
      {/* Header */}
      <div className="text-white pb-6" style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #1e3a7a 100%)' }}>
        <div className="max-w-lg mx-auto px-4 pt-4 flex items-start justify-between">
          <div>
            <p className="text-blue-300 text-xs font-medium">代號 {code}・{branch.region}</p>
            <h1 className="text-2xl font-black text-white mt-0.5 tracking-tight">{branch.name}</h1>
          </div>
          <Link href="/" className="text-blue-300 hover:text-white text-sm transition-colors mt-1">← 返回</Link>
        </div>

        {/* Stats bar */}
        {activeRequests.length > 0 && (
          <div className="max-w-lg mx-auto px-4 mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl px-3 py-3 text-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <p className="text-2xl font-black text-white">{totalRequested}</p>
              <p className="text-blue-300 text-xs mt-0.5">登記件數</p>
            </div>
            <div className="rounded-2xl px-3 py-3 text-center" style={{ background: 'rgba(16,185,129,0.2)' }}>
              <p className="text-2xl font-black text-emerald-300">{totalMatched}</p>
              <p className="text-emerald-400 text-xs mt-0.5">已配對</p>
            </div>
            <div className="rounded-2xl px-3 py-3 text-center" style={{ background: 'rgba(245,158,11,0.2)' }}>
              <p className="text-2xl font-black text-amber-300">{totalRemaining}</p>
              <p className="text-amber-400 text-xs mt-0.5">待配對</p>
            </div>
          </div>
        )}
      </div>


      <div className="max-w-lg mx-auto px-4 -mt-1 pb-8 space-y-4">

        {stepGuide}

        <ContactCard contact={data.contact} onSave={handleSaveContact} />

        {registerBlock}

        {tabsBlock}
      </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-xl">
          {toast}
        </div>
      )}
    </main>
  )
}

function RequestCard({
  request, confirmedMatches, myCode, onEdit, onCancel, onCancelRequest, onCancelConfirm
}: {
  request: ExchangeRequest
  confirmedMatches: MatchProposal[]
  myCode: string
  onEdit: (id: string, count: number, customers: number | null) => void
  onCancel: (id: string) => void
  onCancelRequest: (matchId: string) => void
  onCancelConfirm: (matchId: string, action: 'approve' | 'reject' | 'withdraw') => void
}) {
  const [editing, setEditing] = useState(false)
  const [editCount, setEditCount] = useState(String(request.requested_count))
  const [editCustomers, setEditCustomers] = useState(request.customer_count?.toString() ?? '')
  const isWaiting = request.status === 'waiting'
  const matchedCount = request.requested_count - request.remaining_count
  const pct = request.requested_count > 0 ? Math.round((matchedCount / request.requested_count) * 100) : 0

  function saveEdit() {
    onEdit(request.id, parseInt(editCount), editCustomers ? parseInt(editCustomers) : null)
    setEditing(false)
  }

  /**
   * 撤下整筆登記會連已確認的配對一起還原，後果比使用者預期的大很多。
   * 曾經有分行把這個當成「解除單筆配對」按下去，整筆 5 件登記連同已確認的配對一起沒了，
   * 所以這裡把會發生的事逐項寫清楚，已有配對時還要再確認一次。
   */
  function confirmWithdraw() {
    const activeMatches = confirmedMatches.filter(m => m.status === 'confirmed')
    const matchedCases = activeMatches.reduce((s, m) => s + m.proposed_count, 0)

    const lines = [
      `確定要撤下「${TRUST_TYPE_LABELS[request.trust_type]} ${request.requested_count} 件」這整筆登記嗎？`,
      '',
      '會發生的事：',
      '・這筆登記從配對媒合頁下架',
      '・所有待確認的邀請一併婉拒',
    ]
    if (activeMatches.length > 0) {
      lines.push(
        `・已完成的 ${activeMatches.length} 筆配對（共 ${matchedCases} 件）會一併解除，件數退還給對方`,
        '',
        '※ 若只是想解除其中一筆配對，請關掉這個視窗，改按該筆配對右側的「解除這筆配對」。'
      )
    }
    if (!confirm(lines.join('\n'))) return

    if (activeMatches.length > 0) {
      const names = activeMatches
        .map(m => (m.from_request_id === request.id ? m.to_branch_name : m.from_branch_name))
        .join('、')
      if (!confirm(`再次確認：與 ${names} 已完成的配對會被解除。確定撤下整筆登記？`)) return
    }
    onCancel(request.id)
  }

  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden">
      {/* 標題列 */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 bg-gray-50">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: request.trust_type === 'care' ? '#fef3c7' : request.trust_type === 'general' ? '#ede9fe' : '#dbeafe',
                     color: request.trust_type === 'care' ? '#92400e' : request.trust_type === 'general' ? '#5b21b6' : '#1e40af' }}>
            {TRUST_TYPE_LABELS[request.trust_type ?? 'disability']}
          </span>
          <span className="font-black text-gray-900 text-lg">{request.requested_count}</span>
          <span className="text-gray-500 text-sm">件</span>
          {request.contact_info && (
            <span className="text-xs text-gray-400">・📞 {request.contact_info}</span>
          )}
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-bold shrink-0 ${
          isWaiting ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {isWaiting ? '等待中' : '已完成'}
        </span>
      </div>

      {/* 進度條 */}
      {matchedCount > 0 && (
        <div className="px-4 pt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>已配對 <strong className="text-emerald-600">{matchedCount}</strong> 件</span>
            <span className="text-gray-400">{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full transition-all"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)' }} />
          </div>
        </div>
      )}

      {/* 已配對清單 */}
      {confirmedMatches.length > 0 && (
        <div className="px-4 pt-3 space-y-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">已配對分行</p>
          {confirmedMatches.map(m => {
            const isFrom = m.from_request_id === request.id
            const partner = isFrom ? m.to_branch_name : m.from_branch_name
            const partnerCode = isFrom ? m.to_branch_code : m.from_branch_code
            const iRequested = m.cancel_requested_by === myCode
            const otherRequested = m.cancel_status === 'pending' && !iRequested

            return (
              <div key={m.id} className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {partner} <span className="text-gray-400 font-normal text-xs">({partnerCode})</span>
                    </p>
                    <p className="text-blue-600 text-sm font-bold mt-0.5">交換 {m.proposed_count} 件</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString('zh-TW') : ''} 配對完成
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {m.cancel_status === 'none' && (
                      <button onClick={() => onCancelRequest(m.id)}
                        className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 px-2.5 py-1.5 rounded-lg transition-colors">
                        解除這筆配對
                      </button>
                    )}
                    {m.cancel_status === 'pending' && iRequested && (
                      <div className="space-y-1 text-right">
                        <p className="text-xs text-amber-600 font-semibold">⏳ 等待確認</p>
                        <button onClick={() => onCancelConfirm(m.id, 'withdraw')}
                          className="text-xs text-gray-400 hover:text-gray-600 underline">撤回</button>
                      </div>
                    )}
                    {otherRequested && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-amber-600 font-bold">⚠️ 對方申請取消</p>
                        <div className="flex gap-1">
                          <button onClick={() => onCancelConfirm(m.id, 'approve')}
                            className="text-xs bg-amber-500 text-white px-2.5 py-1 rounded-lg font-bold">同意</button>
                          <button onClick={() => onCancelConfirm(m.id, 'reject')}
                            className="text-xs border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg">拒絕</button>
                        </div>
                      </div>
                    )}
                    {m.cancel_status === 'rejected' && iRequested && (
                      <div className="space-y-1 text-right">
                        <p className="text-xs text-red-500 font-semibold">✗ 對方拒絕</p>
                        <button onClick={() => onCancelRequest(m.id)}
                          className="text-xs text-gray-400 hover:text-red-500 underline">重新申請</button>
                      </div>
                    )}
                    {m.cancel_status === 'rejected' && !iRequested && (
                      <p className="text-xs text-gray-400">✗ 已拒絕取消</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 操作按鈕 */}
      {isWaiting && (
        <div className="px-4 pt-3 pb-4">
          {matchedCount > 0 && (
            <p className="text-xs font-semibold text-gray-500 mb-2">剩餘 {request.remaining_count} 件待配對</p>
          )}
          {!editing && (
            request.customer_count !== null ? (
              <p className="text-xs text-gray-500 mb-2">
                來自 <b className="text-gray-700">{request.customer_count}</b> 位不同客戶
                <span className="text-gray-400">：跟每一家分行最多換 {request.customer_count} 件</span>
              </p>
            ) : (
              <button onClick={() => setEditing(true)}
                className="w-full text-left mb-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 hover:bg-amber-100 transition-colors">
                <p className="text-xs text-amber-800 font-bold">尚未填「來自幾位不同客戶」</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  同一位客戶在同一家分行只能計一件，填了系統才能在配對超量時提醒你 →
                </p>
              </button>
            )
          )}
          {editing ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">總件數</label>
                  <input
                    type="number" min={1} value={editCount}
                    onChange={e => setEditCount(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">不同客戶數</label>
                  <input
                    type="number" min={1} max={editCount || undefined} value={editCustomers}
                    onChange={e => setEditCustomers(e.target.value)}
                    placeholder="選填"
                    className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                客戶數＝跟每一家分行最多能換幾件。聯絡方式請改上方的「分行聯絡方式」。
              </p>
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)}
                  className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-xl text-sm font-semibold">取消</button>
                <button onClick={saveEdit}
                  className="flex-1 text-white py-2 rounded-xl text-sm font-bold"
                  style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>儲存</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setEditing(true)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm py-2.5 rounded-xl font-semibold transition-colors">
                編輯
              </button>
              <button onClick={confirmWithdraw}
                className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm py-2.5 rounded-xl font-semibold transition-colors">
                撤下整筆登記
              </button>
            </div>
          )}
        </div>
      )}

      {!isWaiting && confirmedMatches.length === 0 && (
        <div className="px-4 pb-4 pt-2">
          <p className="text-xs text-gray-400 text-center py-2">所有件數已配對完成</p>
        </div>
      )}
    </div>
  )
}

function ProposalCard({ proposal, incoming, onAction, processingId, myRequest, alreadyExchanged }: {
  proposal: MatchProposal
  incoming: boolean
  onAction: (id: string, action: 'confirm' | 'reject') => void
  processingId: string | null
  /** 我方被提案的那筆登記，用來取 customer_count */
  myRequest?: ExchangeRequest
  /** 我方與對方分行、此信託類型已經換掉的件數（不含這筆提案） */
  alreadyExchanged: number
}) {
  const other = incoming ? proposal.from_branch_name : proposal.to_branch_name
  const otherCode = incoming ? proposal.from_branch_code : proposal.to_branch_code
  const isProcessing = processingId === proposal.id

  // 同一客戶在同一分行只能計一件，所以跟同一家分行累計交換的件數不該超過客戶數。
  // 客戶數是分行自填、系統無從查證，因此只提醒不阻擋。
  const cap = myRequest?.customer_count ?? null
  const total = alreadyExchanged + proposal.proposed_count
  const overCap = cap !== null && total > cap

  return (
    <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">
            {other} <span className="text-gray-400 font-normal text-xs">({otherCode})</span>
          </p>
          <p className="text-blue-600 font-black text-lg mt-0.5">{proposal.proposed_count} <span className="text-sm font-normal text-gray-500">件</span></p>
          <p className="text-xs text-gray-400">{new Date(proposal.created_at).toLocaleDateString('zh-TW')}</p>
        </div>
        {incoming ? (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onAction(proposal.id, 'confirm')}
              disabled={!!processingId}
              className="text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
              {isProcessing ? '處理中…' : '確認'}
            </button>
            <button onClick={() => onAction(proposal.id, 'reject')}
              disabled={!!processingId}
              className="bg-white hover:bg-gray-100 text-gray-600 text-sm px-3 py-2 rounded-xl border border-gray-200 disabled:opacity-50">
              拒絕
            </button>
          </div>
        ) : (
          <span className="text-xs text-blue-600 bg-blue-100 px-3 py-1.5 rounded-full shrink-0 font-semibold">等待確認</span>
        )}
      </div>

      {alreadyExchanged > 0 && (
        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-blue-100">
          你已與 {other} 交換過 <b className="text-gray-700">{alreadyExchanged} 件</b>
          {myRequest && `〈${TRUST_TYPE_LABELS[myRequest.trust_type]}〉`}
          {cap !== null && `，加上這筆共 ${total} 件`}
        </p>
      )}

      {overCap && (
        <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5">
          <p className="text-xs text-amber-800 font-bold">
            ⚠️ 超過你登記的 {cap} 位客戶上限
          </p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            同一位客戶在 {other} 只能計一件，你回給對方的 {total} 件中，
            對方可能只算得到 {cap} 件。確認前請先確定這些件數來自不同客戶。
          </p>
        </div>
      )}

      {incoming && cap === null && (
        <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-blue-100">
          這筆登記還沒填「來自幾位不同客戶」，系統無法提醒客戶重複的風險
        </p>
      )}
    </div>
  )
}

function PastHistoryCard({ proposal, myCode }: { proposal: MatchProposal; myCode: string }) {
  const isFrom = proposal.from_branch_code === myCode
  const other = isFrom ? proposal.to_branch_name : proposal.from_branch_name
  const otherCode = isFrom ? proposal.to_branch_code : proposal.from_branch_code
  const isCancelled = proposal.status === 'cancelled'

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
      <div>
        <p className="font-semibold text-gray-800">
          {other} <span className="text-gray-400 text-xs font-normal">({otherCode})</span>
        </p>
        <p className="text-sm text-gray-500 mt-0.5">{proposal.proposed_count} 件</p>
        <p className="text-xs text-gray-400 mt-0.5">{new Date(proposal.created_at).toLocaleDateString('zh-TW')}</p>
      </div>
      <span className={`text-xs px-3 py-1.5 rounded-full font-bold ${
        isCancelled ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'
      }`}>
        {isCancelled ? '取消配對' : '已拒絕'}
      </span>
    </div>
  )
}

/**
 * 分行聯絡方式：整個分行共用一份，改一次三種信託類型都套用。
 * 沒填過時用醒目樣式提示，因為別的分行看板上會看不到聯絡方式。
 */
function ContactCard({ contact, onSave }: {
  contact: BranchContact
  onSave: (contactInfo: string, email: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [info, setInfo] = useState(contact.contact_info ?? '')
  const [email, setEmail] = useState(contact.notification_email ?? '')
  const [saving, setSaving] = useState(false)

  const isEmpty = !contact.contact_info && !contact.notification_email

  function startEdit() {
    setInfo(contact.contact_info ?? '')
    setEmail(contact.notification_email ?? '')
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    const ok = await onSave(info.trim(), email.trim())
    setSaving(false)
    if (ok) setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-blue-200 p-5 space-y-3">
        <div>
          <h2 className="font-bold text-gray-900">分行聯絡方式</h2>
          <p className="text-xs text-gray-500 mt-0.5">整個分行共用，所有信託類型都適用</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            聯絡方式 <span className="text-gray-400 font-normal">（會顯示在配對媒合頁）</span>
          </label>
          <input
            type="text"
            value={info}
            onChange={e => setInfo(e.target.value)}
            placeholder="例：分機 1234"
            className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            通知信箱 <span className="text-gray-400 font-normal">（不會公開）</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="例：abc@bank.com.tw"
            className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            填了才會在收到配對提案、配對成功時收到通知信
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)}
            className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-semibold">取消</button>
          <button onClick={save} disabled={saving}
            className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
            {saving ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <button onClick={startEdit}
        className="w-full bg-amber-50 rounded-2xl shadow-sm border border-amber-200 p-4 text-left hover:bg-amber-100 transition-colors">
        <p className="text-amber-800 font-bold text-sm">尚未填寫分行聯絡方式</p>
        <p className="text-amber-700 text-xs mt-0.5">
          填了別的分行才知道怎麼聯絡你，也才能收到配對通知信 →
        </p>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium">分行聯絡方式</p>
        <p className="text-sm text-gray-800 font-semibold mt-1 truncate">
          {contact.contact_info ? `📞 ${contact.contact_info}` : '📞 未填'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {contact.notification_email ? `✉️ ${contact.notification_email}` : '✉️ 未填，不會收到通知信'}
        </p>
      </div>
      <button onClick={startEdit}
        className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-xl font-semibold transition-colors">
        編輯
      </button>
    </div>
  )
}

function RegisterForm({ trustType, setTrustType, caseCount, setCaseCount, customerCount, setCustomerCount, submitting, onSubmit }: {
  trustType: TrustType
  setTrustType: (v: TrustType) => void
  caseCount: string
  setCaseCount: (v: string) => void
  customerCount: string
  setCustomerCount: (v: string) => void
  submitting: boolean
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">信託類型 <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.entries(TRUST_TYPE_LABELS) as [TrustType, string][]).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => setTrustType(type)}
              className={`py-2 px-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                trustType === type
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          欲交換件數 <span className="text-red-500">*</span>
        </label>
        <input
          type="number" min={1} required
          value={caseCount}
          onChange={e => setCaseCount(e.target.value)}
          placeholder="例：3"
          className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors text-lg font-bold"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          來自幾位不同客戶 <span className="text-gray-400 font-normal">（選填）</span>
        </label>
        <input
          type="number" min={1} max={caseCount || undefined}
          value={customerCount}
          onChange={e => setCustomerCount(e.target.value)}
          placeholder={caseCount ? `最多 ${caseCount}` : '例：2'}
          className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
        />
        <p className="text-xs text-gray-400 mt-1.5">
          同一位客戶在同一家分行只能計一件，所以這個數字＝跟每一家分行最多能換幾件。
          例如 5 件都是同一位客戶簽的，就要填 1，代表得拆給 5 家不同分行。
        </p>
      </div>
      <button
        type="submit" disabled={submitting}
        className="w-full text-white font-bold py-3.5 rounded-2xl transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}>
        {submitting ? '登記中…' : '登記申請'}
      </button>
    </form>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f1f3d 0%, #1e3a7a 100%)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-blue-300 text-sm">載入中…</p>
      </div>
    </div>
  )
}
