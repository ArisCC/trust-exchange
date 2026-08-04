// 主流程端對端測試：登記、分行聯絡方式、提案、確認、編輯、取消、婉拒。
// 需要乾淨的測試資料庫，用法見 tests/README.md
const BASE = process.env.TEST_BASE ?? 'http://localhost:3101'

let pass = 0, fail = 0
const check = (name, cond, detail = '') =>
  cond ? (pass++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name} ${detail}`))

const api = async (path, opts) => {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const submit = (code, name, type, count, extra = {}) =>
  api('/api/submit', {
    method: 'POST',
    body: JSON.stringify({ branch_code: code, branch_name: name, trust_type: type, case_count: count, ...extra }),
  })

console.log('\n▎登記申請')
const a = await submit('901', 'A分行', 'disability', 5)
const b = await submit('902', 'B分行', 'disability', 3)
const c = await submit('903', 'C分行', 'care', 4)
check('A分行登記成功', a.status === 200 && a.body.id)
check('B分行登記成功', b.status === 200 && b.body.id)
check('C分行(安養)登記成功', c.status === 200 && c.body.id)
check('無效信託類型被擋', (await submit('904', 'D分行', 'invalid', 1)).status === 400)

console.log('\n▎分行聯絡方式（分行層級，不隨信託類型重複）')
check('無效信箱被擋', (await api('/api/branch/901/contact', {
  method: 'PATCH', body: JSON.stringify({ contact_info: '1234', notification_email: 'not-an-email' }),
})).status === 400)
check('設定聯絡方式', (await api('/api/branch/901/contact', {
  method: 'PATCH', body: JSON.stringify({ contact_info: '分機 1234', notification_email: 'a@test.com' }),
})).status === 200)
const gotContact = await api('/api/branch/901/contact')
check('讀回聯絡方式', gotContact.body.contact_info === '分機 1234')

const a2 = await submit('901', 'A分行', 'care', 2)
const branchA0 = await api('/api/branch/901')
check('同分行多類型共用一份聯絡方式', branchA0.body.contact.contact_info === '分機 1234')
await api('/api/branch/901/contact', {
  method: 'PATCH', body: JSON.stringify({ contact_info: '分機 9999', notification_email: 'a@test.com' }),
})
const boardC = (await api('/api/board')).body.filter(r => r.branch_code === '901')
check('改一次即套用全分行', boardC.length === 2 && boardC.every(r => r.contact_info === '分機 9999'))
await api(`/api/request/${a2.body.id}`, { method: 'DELETE' })

console.log('\n▎看板')
check('看板顯示 3 筆', (await api('/api/board')).body.length === 3)
const boardEx = await api('/api/board?exclude=901')
check('exclude 排除自己分行', boardEx.body.length === 2 && !boardEx.body.some(r => r.branch_code === '901'))
check('看板回傳 pending_count', boardEx.body.every(r => 'pending_count' in r))

console.log('\n▎提案前的檢查')
check('跨信託類型被擋', (await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: a.body.id, to_request_id: c.body.id, proposed_count: 1 }),
})).status === 400)
check('超過對方可用件數被擋', (await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: a.body.id, to_request_id: b.body.id, proposed_count: 4 }),
})).status === 400)

console.log('\n▎提案')
const p1 = await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: a.body.id, to_request_id: b.body.id, proposed_count: 2 }),
})
check('提案成功', p1.status === 200 && p1.body.status === 'pending')
check('重複提案被擋', (await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: a.body.id, to_request_id: b.body.id, proposed_count: 1 }),
})).status === 400)
check('pending 佔用後件數不足被擋', (await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: b.body.id, to_request_id: c.body.id, proposed_count: 2 }),
})).status === 400)

console.log('\n▎pending 佔用要反映在畫面數字上')
const boardPending = (await api('/api/board')).body.find(r => r.id === b.body.id)
check('看板 pending_count 正確', boardPending.pending_count === 2, `實際 ${boardPending?.pending_count}`)
check('可交換 = 剩餘 − 洽談中', boardPending.remaining_count - boardPending.pending_count === 1)
const myB = (await api('/api/branch/902')).body.myRequests[0]
check('分行頁 myRequests 也帶 pending_count', myB.pending_count === 2, `實際 ${myB?.pending_count}`)

console.log('\n▎分行頁資料')
const branchB = await api('/api/branch/902')
check('B分行看到 1 筆收到的提案', branchB.body.incomingProposals.length === 1)
check('B分行沒有送出的提案', branchB.body.outgoingProposals.length === 0)
const branchA = await api('/api/branch/901')
check('A分行看到 1 筆送出的提案', branchA.body.outgoingProposals.length === 1)
check('聯絡方式來自分行層級', branchA.body.contact.notification_email === 'a@test.com')

console.log('\n▎確認配對')
const conf = await api('/api/confirm', { method: 'POST', body: JSON.stringify({ proposal_id: p1.body.id, action: 'confirm' }) })
check('確認成功', conf.status === 200 && conf.body.status === 'confirmed')
check('A分行剩餘 5-2=3', (await api(`/api/status/${a.body.id}`)).body.remaining_count === 3)
check('B分行剩餘 3-2=1', (await api(`/api/status/${b.body.id}`)).body.remaining_count === 1)
check('確認後 pending 歸零', (await api('/api/board')).body.find(r => r.id === b.body.id).pending_count === 0)
check('已確認的提案無法再確認', (await api('/api/confirm', {
  method: 'POST', body: JSON.stringify({ proposal_id: p1.body.id, action: 'confirm' }),
})).status === 404)

console.log('\n▎編輯件數')
check('件數不可低於已承諾', (await api(`/api/request/${a.body.id}`, {
  method: 'PATCH', body: JSON.stringify({ case_count: 1 }),
})).status === 400)
check('放大件數成功', (await api(`/api/request/${a.body.id}`, {
  method: 'PATCH', body: JSON.stringify({ case_count: 8 }),
})).status === 200)
check('編輯後剩餘 8-2=6', (await api(`/api/status/${a.body.id}`)).body.remaining_count === 6)

console.log('\n▎解除已確認的配對（需雙方同意）')
check('送出取消申請', (await api(`/api/match/${p1.body.id}/cancel-request`, {
  method: 'POST', body: JSON.stringify({ branch_code: '901' }),
})).status === 200)
check('不能自行同意取消', (await api(`/api/match/${p1.body.id}/cancel-confirm`, {
  method: 'POST', body: JSON.stringify({ branch_code: '901', action: 'approve' }),
})).status === 400)
check('對方同意取消', (await api(`/api/match/${p1.body.id}/cancel-confirm`, {
  method: 'POST', body: JSON.stringify({ branch_code: '902', action: 'approve' }),
})).body.status === 'approved')
check('A分行件數還原 6+2=8', (await api(`/api/status/${a.body.id}`)).body.remaining_count === 8)
check('B分行件數還原 1+2=3', (await api(`/api/status/${b.body.id}`)).body.remaining_count === 3)

console.log('\n▎撤下整筆登記')
check('撤下成功', (await api(`/api/request/${c.body.id}`, { method: 'DELETE' })).status === 200)
check('狀態變為 cancelled', (await api(`/api/status/${c.body.id}`)).body.status === 'cancelled')
check('看板不再顯示', !(await api('/api/board')).body.some(r => r.branch_code === '903'))

console.log('\n▎件數歸零自動完成')
const z1 = await submit('905', 'E分行', 'general', 2)
const z2 = await submit('906', 'F分行', 'general', 2)
const zp = await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: z1.body.id, to_request_id: z2.body.id, proposed_count: 2 }),
})
await api('/api/confirm', { method: 'POST', body: JSON.stringify({ proposal_id: zp.body.id, action: 'confirm' }) })
check('歸零後狀態為 completed', (await api(`/api/status/${z1.body.id}`)).body.status === 'completed')

console.log('\n▎婉拒提案')
const r1 = await submit('907', 'G分行', 'disability', 2)
const rp = await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: r1.body.id, to_request_id: a.body.id, proposed_count: 1 }),
})
check('婉拒成功', (await api('/api/confirm', {
  method: 'POST', body: JSON.stringify({ proposal_id: rp.body.id, action: 'reject' }),
})).body.status === 'rejected')
check('婉拒後件數未被扣除', (await api(`/api/status/${r1.body.id}`)).body.remaining_count === 2)
check('婉拒後 pending 釋出', (await api('/api/board')).body.find(r => r.id === r1.body.id).pending_count === 0)

console.log(`\n${'='.repeat(40)}\n通過 ${pass} 項，失敗 ${fail} 項\n${'='.repeat(40)}`)
process.exit(fail > 0 ? 1 : 0)
