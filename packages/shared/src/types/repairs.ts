import type { BaseEntity, UUID } from './base';

/** Repair ticket lifecycle states. */
export type RepairStatus =
  | 'received'
  | 'diagnosing'
  | 'waiting_parts'
  | 'repairing'
  | 'ready'
  | 'delivered'
  | 'canceled'
  | 'warranty_return';

export interface Repair extends BaseEntity {
  ticket_no: string;
  branch_id: UUID;
  customer_id: UUID;
  /** Assigned technician. */
  technician_id: UUID | null;
  received_by: UUID;

  device_brand: string;
  device_model: string;
  device_imei: string | null;
  device_password: string | null;
  problem_description: string;
  customer_notes: string | null;
  /** JSON array: ["charger", "cover", "box"]. */
  accessories: string[];
  /** JSON array of base64 image thumbnails (max 4). */
  inspection_photos: string[];

  status: RepairStatus;
  received_at: string;
  estimated_delivery_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  delivered_at: string | null;

  labor_cost: number;
  parts_cost: number;
  discount: number;
  total: number;
  paid: number;
  due_amount: number;

  warranty_days: number;
  /** If this is a warranty re-repair, links to original repair. */
  parent_repair_id: UUID | null;

  notes: string | null;
}

export interface RepairStatusHistory extends BaseEntity {
  repair_id: UUID;
  from_status: RepairStatus | null;
  to_status: RepairStatus;
  note: string | null;
  user_id: UUID;
}

export interface RepairPart extends BaseEntity {
  repair_id: UUID;
  product_id: UUID;
  quantity: number;
  unit_price: number;
  total: number;
  /** Movement reference for inventory deduction. */
  stock_movement_id: UUID | null;
}
