/**
 * POS cart store — Zustand store for the POS cart state.
 *
 * Survives page navigation (but not page reload — uses in-memory only
 * to avoid stale data after session changes).
 *
 * State:
 *  - items: cart items (product + qty + price + discount)
 *  - customerId: selected customer (null = walk-in)
 *  - discount: sale-level discount
 *  - discountType: 'amount' | 'percent'
 *  - payments: split payment entries
 */
import { create } from 'zustand';
import type { PaymentMethodKey } from '@mobile-shop/shared';

export interface CartItem {
  productId: string;
  productName: string;
  productSku: string;
  productType: string;
  deviceUnitId: string | null;
  imei1: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: 'amount' | 'percent';
  taxRate: number;
  stockLevel: number | null; // available stock for standard products
}

export interface PaymentEntry {
  method: PaymentMethodKey;
  amount: number;
  reference?: string | null;
}

interface PosState {
  items: CartItem[];
  customerId: string | null;
  customerName: string | null;
  discount: number;
  discountType: 'amount' | 'percent';
  payments: PaymentEntry[];
  notes: string;

  // Actions
  addItem: (item: CartItem) => void;
  removeItem: (index: number) => void;
  updateItem: (index: number, updates: Partial<CartItem>) => void;
  incrementItem: (index: number) => void;
  decrementItem: (index: number) => void;
  clearCart: () => void;

  setCustomer: (id: string | null, name: string | null) => void;

  setDiscount: (amount: number, type: 'amount' | 'percent') => void;

  addPayment: (entry: PaymentEntry) => void;
  removePayment: (index: number) => void;
  clearPayments: () => void;

  setNotes: (notes: string) => void;

  // Computed
  getSubtotal: () => number;
  getSaleDiscount: () => number;
  getTax: () => number;
  getTotal: () => number;
  getTotalPaid: () => number;
  getChange: () => number;
  getDueAmount: () => number;
}

export const usePosStore = create<PosState>((set, get) => ({
  items: [],
  customerId: null,
  customerName: null,
  discount: 0,
  discountType: 'amount',
  payments: [],
  notes: '',

  addItem: (item) => {
    const items = get().items;
    // For standard products: merge if same product already in cart.
    // For IMEI products: each is unique (different device_unit_id).
    if (item.productType === 'standard' && !item.deviceUnitId) {
      const existingIdx = items.findIndex(
        (i) => i.productId === item.productId && !i.deviceUnitId,
      );
      if (existingIdx >= 0) {
        const updated = [...items];
        updated[existingIdx] = {
          ...updated[existingIdx]!,
          quantity: updated[existingIdx]!.quantity + item.quantity,
        };
        set({ items: updated });
        return;
      }
    }
    set({ items: [...items, item] });
  },

  removeItem: (index) => {
    set({ items: get().items.filter((_, i) => i !== index) });
  },

  updateItem: (index, updates) => {
    const items = [...get().items];
    if (items[index]) {
      items[index] = { ...items[index]!, ...updates };
      set({ items });
    }
  },

  incrementItem: (index) => {
    const items = [...get().items];
    if (items[index]) {
      items[index] = { ...items[index]!, quantity: items[index]!.quantity + 1 };
      set({ items });
    }
  },

  decrementItem: (index) => {
    const items = [...get().items];
    if (items[index]) {
      const newQty = items[index]!.quantity - 1;
      if (newQty <= 0) {
        set({ items: items.filter((_, i) => i !== index) });
      } else {
        items[index] = { ...items[index]!, quantity: newQty };
        set({ items });
      }
    }
  },

  clearCart: () =>
    set({
      items: [],
      customerId: null,
      customerName: null,
      discount: 0,
      discountType: 'amount',
      payments: [],
      notes: '',
    }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  setDiscount: (amount, type) => set({ discount: amount, discountType: type }),

  addPayment: (entry) => set({ payments: [...get().payments, entry] }),

  removePayment: (index) =>
    set({ payments: get().payments.filter((_, i) => i !== index) }),

  clearPayments: () => set({ payments: [] }),

  setNotes: (notes) => set({ notes }),

  getSubtotal: () => {
    return get().items.reduce((sum, item) => {
      const gross = item.unitPrice * item.quantity;
      const itemDiscount =
        item.discountType === 'percent'
          ? (gross * item.discount) / 100
          : item.discount;
      return sum + gross - itemDiscount;
    }, 0);
  },

  getSaleDiscount: () => {
    const { discount, discountType } = get();
    const subtotal = get().getSubtotal();
    return discountType === 'percent' ? (subtotal * discount) / 100 : discount;
  },

  getTax: () => {
    const subtotal = get().getSubtotal();
    const saleDiscount = get().getSaleDiscount();
    const taxableAmount = subtotal - saleDiscount;
    // Compute tax proportionally per item.
    return get().items.reduce((sum, item) => {
      const gross = item.unitPrice * item.quantity;
      const itemDiscount =
        item.discountType === 'percent'
          ? (gross * item.discount) / 100
          : item.discount;
      const itemNet = gross - itemDiscount;
      // Proportional share of sale discount.
      const proportionalShare = subtotal > 0 ? (itemNet / subtotal) * saleDiscount : 0;
      const itemTaxable = itemNet - proportionalShare;
      return sum + (itemTaxable * item.taxRate) / 100;
    }, 0);
  },

  getTotal: () => {
    return get().getSubtotal() - get().getSaleDiscount() + get().getTax();
  },

  getTotalPaid: () => {
    return get().payments.reduce((sum, p) => sum + p.amount, 0);
  },

  getChange: () => {
    const total = get().getTotal();
    const paid = get().getTotalPaid();
    // Only non-credit payments generate change.
    const nonCreditPaid = get().payments
      .filter((p) => p.method !== 'credit')
      .reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, nonCreditPaid - total);
  },

  getDueAmount: () => {
    const total = get().getTotal();
    const nonCreditPaid = get().payments
      .filter((p) => p.method !== 'credit')
      .reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, total - nonCreditPaid);
  },
}));
