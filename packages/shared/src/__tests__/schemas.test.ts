import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  createUserSchema,
  createProductSchema,
  createCustomerSchema,
  createRepairSchema,
  createSaleSchema,
  imeiSchema,
  phoneSchema,
} from '../index';

describe('Auth Schemas', () => {
  describe('loginSchema', () => {
    it('accepts valid login', () => {
      const result = loginSchema.safeParse({
        username: 'admin',
        password: 'Admin@123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short username', () => {
      const result = loginSchema.safeParse({
        username: 'ab',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = loginSchema.safeParse({
        username: 'admin',
        password: 'short',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('User Schemas', () => {
  describe('createUserSchema', () => {
    it('accepts valid user', () => {
      const result = createUserSchema.safeParse({
        username: 'ahmed.mohamed',
        password: 'StrongPass123',
        fullName: 'أحمد محمد',
        roleId: '00000000-0000-4000-8000-000000000000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects username with Arabic chars', () => {
      const result = createUserSchema.safeParse({
        username: 'أحمد',
        password: 'StrongPass123',
        fullName: 'أحمد محمد',
        roleId: '00000000-0000-4000-8000-000000000000',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Catalog Schemas', () => {
  describe('createProductSchema', () => {
    it('accepts valid product', () => {
      const result = createProductSchema.safeParse({
        sku: 'IP15-PM-256',
        name: 'iPhone 15 Pro Max 256GB',
        costPrice: 50000,
        salePrice: 65000,
      });
      expect(result.success).toBe(true);
    });

    it('applies defaults', () => {
      const result = createProductSchema.safeParse({
        sku: 'TEST-001',
        name: 'Test Product',
        costPrice: 100,
        salePrice: 150,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('standard');
        expect(result.data.taxRate).toBe(14);
        expect(result.data.isActive).toBe(true);
      }
    });
  });
});

describe('Customer Schemas', () => {
  describe('createCustomerSchema', () => {
    it('accepts valid customer', () => {
      const result = createCustomerSchema.safeParse({
        name: 'أحمد محمد',
        phone: '01012345678',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short name', () => {
      const result = createCustomerSchema.safeParse({
        name: 'أ',
        phone: '01012345678',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Repair Schemas', () => {
  describe('createRepairSchema', () => {
    it('accepts valid repair', () => {
      const result = createRepairSchema.safeParse({
        branchId: '00000000-0000-4000-8000-000000000000',
        customerId: '00000000-0000-4000-8000-000000000001',
        deviceBrand: 'Samsung',
        deviceModel: 'Galaxy A52',
        problemDescription: 'شاشة مكسورة',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.warrantyDays).toBe(0);
        expect(result.data.laborCost).toBe(0);
      }
    });

    it('rejects empty problem description', () => {
      const result = createRepairSchema.safeParse({
        branchId: '00000000-0000-4000-8000-000000000000',
        customerId: '00000000-0000-4000-8000-000000000001',
        deviceBrand: 'Samsung',
        deviceModel: 'Galaxy A52',
        problemDescription: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Sale Schemas', () => {
  describe('createSaleSchema', () => {
    it('accepts valid sale', () => {
      const result = createSaleSchema.safeParse({
        branchId: '00000000-0000-4000-8000-000000000000',
        cashierId: '00000000-0000-4000-8000-000000000001',
        items: [
          {
            productId: '00000000-0000-4000-8000-000000000002',
            quantity: 2,
            unitPrice: 500,
          },
        ],
        payments: [
          { method: 'cash', amount: 1000 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty items array', () => {
      const result = createSaleSchema.safeParse({
        branchId: '00000000-0000-4000-8000-000000000000',
        cashierId: '00000000-0000-4000-8000-000000000001',
        items: [],
        payments: [{ method: 'cash', amount: 100 }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty payments array', () => {
      const result = createSaleSchema.safeParse({
        branchId: '00000000-0000-4000-8000-000000000000',
        cashierId: '00000000-0000-4000-8000-000000000001',
        items: [{ productId: '00000000-0000-4000-8000-000000000002', quantity: 1, unitPrice: 100 }],
        payments: [],
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Common Schemas', () => {
  describe('imeiSchema', () => {
    it('accepts valid 15-digit IMEI', () => {
      // Use a known-valid IMEI with correct Luhn checksum.
      const result = imeiSchema.safeParse('490154203237518');
      expect(result.success).toBe(true);
    });

    it('rejects 14-digit string', () => {
      const result = imeiSchema.safeParse('12345678901234');
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric', () => {
      const result = imeiSchema.safeParse('12345678901234abc');
      expect(result.success).toBe(false);
    });
  });

  describe('phoneSchema', () => {
    it('accepts Egyptian mobile', () => {
      const result = phoneSchema.safeParse('01012345678');
      expect(result.success).toBe(true);
    });

    it('accepts +20 format', () => {
      const result = phoneSchema.safeParse('+201012345678');
      expect(result.success).toBe(true);
    });

    it('accepts null', () => {
      const result = phoneSchema.safeParse(null);
      expect(result.success).toBe(true);
    });
  });
});
