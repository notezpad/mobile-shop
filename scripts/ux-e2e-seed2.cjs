/** استكمال داتا UX: فاتورة متأخرة جزئية الدفع للحساب الموجود ux28558374@testshop.dev */
const BASE = 'http://localhost:3100'
;(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ux28558374@testshop.dev', password: 'Test123456' }),
  })
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
  if (!cookie) { console.log('LOGIN FAIL', login.status, JSON.stringify(await login.json())); process.exit(1) }

  const past = new Date(Date.now() - 10 * 86400000).toISOString()
  const sale = await fetch(BASE + '/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      items: [{ productId: 7, quantity: 2, price: 200 }],
      customerId: 2, paid: 100, paymentMethod: 'cash', dueDate: past,
    }),
  })
  console.log('SALE', sale.status, JSON.stringify(await sale.json()).slice(0, 200))
})().catch((e) => { console.error('ERR', e); process.exit(1) })
