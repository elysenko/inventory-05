/** Shared API payload contracts. Mirrors the REST surface under `/api`. */

export type Role = 'USER' | 'MANAGER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  description?: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
}

export interface StockLevelRow {
  id: string;
  itemId: string;
  locationId: string;
  locationName: string;
  zone: string;
  qty: number;
}

export interface ItemDetail extends Item {
  stockLevels: StockLevelRow[];
}

export interface Location {
  id: string;
  name: string;
  zone: string;
  itemCount: number;
  totalQty: number;
}

export type MovementType = 'IN' | 'OUT' | 'TRANSFER';

export interface Movement {
  id: string;
  type: MovementType;
  itemId: string;
  itemSku: string;
  itemName: string;
  fromLocName: string | null;
  toLocName: string | null;
  qty: number;
  unit: string;
  note: string | null;
  userEmail: string;
  createdAt: string;
}

export interface MovementPage {
  data: Movement[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LowStockRow {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
}

export interface AdminSetting {
  key: string;
  service: 'postgresql' | 'minio';
  label: string;
  value: string;
  configured: boolean;
  secret: boolean;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiError {
  status: number;
  message: string;
  errors?: FieldError[];
}
