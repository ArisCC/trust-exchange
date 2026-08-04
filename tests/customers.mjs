// 客戶數上限與跨分行累計。同一位客戶在同一分行只能計一件，
// 所以「不同客戶數」＝跟任一分行累計可交換的上限。系統只提醒不阻擋。
// 需要乾淨的測試資料庫，用法見 tests/README.md
const BASE = process.env.TEST_BASE ?? 'http://localhost:3101'

let pass = 0, fail = 0
const check = (name, cond, detail = '') =>
  cond ? (pass++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name} ${detail}`))

const api = async (path, opts) => {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const submit = (code, name, type, count, customers) =>
  api('/api/submit', {
    method: 'POST',
    body: JSON.stringify({ branch_code: code, branch_name: name, trust_type: type, case_count: count, customer_count: customers }),
  })

console.log('\n▎客戶數驗證')
check('客戶數 0 被擋', (await submit('901', 'A分行', 'general', 5, 0)).status === 400)
check('客戶數大於件數被擋', (await submit('901', 'A分行', 'general', 5, 6)).status === 400)

console.log('\n▎登記與讀回')
const a = await submit('901', 'A分行', 'general', 5, 1)   // 5 件但同一位客戶
const b = await submit('902', 'B分行', 'general', 2, 2)
const c = await submit('903', 'C分行', 'general', 3, null) // 不填
check('5件1客戶登記成功', a.status === 200)
check('2件2客戶登記成功', b.status === 200)
check('不填客戶數也能登記', c.status === 200)
check('customer_count 正確存入', (await api(`/api/status/${a.body.id}`)).body.customer_count === 1)
check('未填為 null', (await api(`/api/status/${c.body.id}`)).body.customer_count === null)

console.log('\n▎累計交換件數（提醒用，不阻擋）')
check('尚未交換時 exchanged 為空', (await api('/api/branch/901')).body.exchanged.length === 0)
const p1 = await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: b.body.id, to_request_id: a.body.id, proposed_count: 2 }),
})
check('超過客戶數上限仍可提案（只提醒不阻擋）', p1.status === 200, JSON.stringify(p1.body))
const ex1 = (await api('/api/branch/901')).body.exchanged.find(e => e.branch_code === '902' && e.trust_type === 'general')
check('待確認的提案已計入累計', ex1?.count === 2, JSON.stringify(ex1))
await api('/api/confirm', { method: 'POST', body: JSON.stringify({ proposal_id: p1.body.id, action: 'confirm' }) })
const ex2 = (await api('/api/branch/901')).body.exchanged.find(e => e.branch_code === '902' && e.trust_type === 'general')
check('確認後累計仍為 2', ex2?.count === 2)

console.log('\n▎不同信託類型分開計算')
const a2 = await submit('901', 'A分行', 'care', 3, 3)
const b2 = await submit('902', 'B分行', 'care', 3, 3)
const p2 = await api('/api/propose', {
  method: 'POST', body: JSON.stringify({ from_request_id: b2.body.id, to_request_id: a2.body.id, proposed_count: 1 }),
})
check('另一類型可獨立提案', p2.status === 200)
const exAll = (await api('/api/branch/901')).body.exchanged
const gen = exAll.find(e => e.branch_code === '902' && e.trust_type === 'general')?.count
const care = exAll.find(e => e.branch_code === '902' && e.trust_type === 'care')?.count
check('general 與 care 分開累計', gen === 2 && care === 1, `general=${gen} care=${care}`)

console.log('\n▎取消後不計入累計')
await api(`/api/request/${a2.body.id}`, { method: 'DELETE' })
const careAfter = (await api('/api/branch/901')).body.exchanged.find(e => e.branch_code === '902' && e.trust_type === 'care')?.count
check('取消的配對已從累計移除', careAfter === undefined, `實際 ${careAfter}`)

console.log('\n▎編輯客戶數')
check('補填客戶數成功', (await api(`/api/request/${c.body.id}`, {
  method: 'PATCH', body: JSON.stringify({ case_count: 3, customer_count: 2 }),
})).status === 200)
check('客戶數已更新為 2', (await api(`/api/status/${c.body.id}`)).body.customer_count === 2)
check('編輯時客戶數大於件數被擋', (await api(`/api/request/${c.body.id}`, {
  method: 'PATCH', body: JSON.stringify({ case_count: 3, customer_count: 5 }),
})).status === 400)

console.log(`\n${'='.repeat(40)}\n通過 ${pass} 項，失敗 ${fail} 項\n${'='.repeat(40)}`)
process.exit(fail > 0 ? 1 : 0)
