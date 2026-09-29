import { describe, it, expect, vi, afterEach } from 'vitest'
import * as React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const apiMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })))
vi.mock('@/lib/api', () => ({ api: apiMock }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { PurchaseReturnDialog } from '@/components/shop/PurchaseReturnDialog'

const order = {
  id: 7, orderNo: 'PO-2026-00007', paid: 1000, refunded: 0,
  items: [
    { id: 11, name: 'شاحن', cost: 50, quantity: 10, returnedQty: 2 },
    { id: 12, name: 'كابل', cost: 100, quantity: 5, returnedQty: 0 },
    { id: 13, name: 'سماعة', cost: 30, quantity: 4, returnedQty: 4 },
  ],
}
afterEach(() => { cleanup(); apiMock.mockClear() })

describe('PurchaseReturnDialog', () => {
  it('computes value/refund, blocks over-qty, posts exact body once even on double click', async () => {
    const onDone = vi.fn(); const onOpenChange = vi.fn()
    render(<PurchaseReturnDialog open onOpenChange={onOpenChange} order={order} hasSupplier onDone={onDone} />)

    // fully-returned line shows the label, no input
    expect(screen.getByText('مرتجع بالكامل')).toBeTruthy()
    expect(screen.getByText(/مرتجع سابقاً: 2/)).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'تأكيد المرتجع' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)                       // nothing selected yet

    const qA = screen.getByLabelText('كمية مرتجع شاحن') as HTMLInputElement
    const qB = screen.getByLabelText('كمية مرتجع كابل') as HTMLInputElement
    fireEvent.change(qA, { target: { value: '3' } })          // 3 x 50 = 150
    fireEvent.change(qB, { target: { value: '99' } })         // clamped to remaining 5 → 500
    // value = 150 + 500 = 650 ; default refund = min(650, paid 1000) = 650
    await waitFor(() => expect(screen.getAllByText(/650/).length).toBeGreaterThan(0))
    expect((screen.getByLabelText(/المبلغ اللي المورد رجّعه/) as HTMLInputElement).value).toBe('650')
    expect(confirm.disabled).toBe(false)

    // refund > value is invalid
    fireEvent.change(screen.getByLabelText(/المبلغ اللي المورد رجّعه/), { target: { value: '700' } })
    await waitFor(() => expect(confirm.disabled).toBe(true))
    fireEvent.change(screen.getByLabelText(/المبلغ اللي المورد رجّعه/), { target: { value: '200' } })
    await waitFor(() => expect(confirm.disabled).toBe(false))

    fireEvent.click(confirm); fireEvent.click(confirm); fireEvent.click(confirm)   // triple click
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
    const [url, opts] = apiMock.mock.calls[0] as any
    expect(url).toBe('/api/purchase-orders/7/returns')
    expect(opts.method).toBe('POST')
    expect(opts.body.items).toEqual([{ itemId: 11, quantity: 3 }, { itemId: 12, quantity: 5 }])
    expect(opts.body.refund).toBe(200)
    expect(opts.body.refundMethod).toBe('cash')
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('no supplier: refund is locked to the full value', async () => {
    render(<PurchaseReturnDialog open onOpenChange={() => {}} order={order} hasSupplier={false} />)
    fireEvent.change(screen.getByLabelText('كمية مرتجع كابل'), { target: { value: '2' } })
    const refund = screen.getByLabelText(/المبلغ المسترد/) as HTMLInputElement
    await waitFor(() => expect(refund.value).toBe('200'))
    expect(refund.disabled).toBe(true)
  })

  it('"return all remaining" fills every returnable line', async () => {
    render(<PurchaseReturnDialog open onOpenChange={() => {}} order={order} hasSupplier />)
    fireEvent.click(screen.getByRole('button', { name: 'إرجاع كل المتبقي' }))
    await waitFor(() => {
      expect((screen.getByLabelText('كمية مرتجع شاحن') as HTMLInputElement).value).toBe('8')
      expect((screen.getByLabelText('كمية مرتجع كابل') as HTMLInputElement).value).toBe('5')
    })
  })
})
