/**
 * Fixtures for the static design preview ONLY.
 *
 * The `mockup` build sets `COLOSSUS_PREVIEW=true`, where there is no API pod to
 * talk to and a reviewer must still see populated screens. Every production
 * build defines it as `false`, so each `IS_PREVIEW ? … : []` collapses to `[]`
 * and this module is dropped from the bundle — the deployed app renders live
 * data from `/api` and nothing else.
 *
 * Nothing outside a `IS_PREVIEW` guard may import these.
 */
import {
  AdminSetting,
  Item,
  ItemDetail,
  Location,
  LowStockRow,
  Movement,
  StockLevelRow,
} from './models';

export const PREVIEW_ITEMS: Item[] = [
  { id: 'itm-1001', sku: 'SKU-1001', name: 'Steel Bracket 90°', unit: 'ea', reorderAt: 40, totalQty: 128, description: 'Zinc-plated mounting bracket' },
  { id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12, description: 'Grade 8.8, 100 per box' },
  { id: 'itm-1003', sku: 'SKU-1003', name: 'Nitrile Gloves (L)', unit: 'box', reorderAt: 30, totalQty: 30, description: 'Powder-free, 100 per box' },
  { id: 'itm-1004', sku: 'SKU-1004', name: 'Packing Tape 48mm', unit: 'roll', reorderAt: 20, totalQty: 96, description: 'Clear acrylic, 66m' },
  { id: 'itm-1005', sku: 'SKU-1005', name: 'Pallet Wrap 500mm', unit: 'roll', reorderAt: 15, totalQty: 4, description: '23 micron stretch film' },
  { id: 'itm-1006', sku: 'SKU-1006', name: 'Safety Goggles', unit: 'ea', reorderAt: 10, totalQty: 54, description: 'Anti-fog, EN166' },
  { id: 'itm-1007', sku: 'SKU-1007', name: 'Thermal Labels 4x6', unit: 'pack', reorderAt: 12, totalQty: 0, description: '250 labels per pack' },
  { id: 'itm-1008', sku: 'SKU-1008', name: 'Cable Ties 300mm', unit: 'bag', reorderAt: 25, totalQty: 210, description: 'Black UV-stable, 100 per bag' },
];

export const PREVIEW_LOCATIONS: Location[] = [
  { id: 'loc-a', name: 'Zone A', zone: 'A', itemCount: 6, totalQty: 246 },
  { id: 'loc-b', name: 'Zone B', zone: 'B', itemCount: 5, totalQty: 178 },
  { id: 'loc-c', name: 'Zone C', zone: 'C', itemCount: 3, totalQty: 110 },
];

export const PREVIEW_ITEM_DETAILS: ItemDetail[] = [
  {
    id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12,
    description: 'Grade 8.8 zinc-plated, 100 bolts per box.',
    stockLevels: [
      { id: 'sl-1', itemId: 'itm-1002', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 7 },
      { id: 'sl-2', itemId: 'itm-1002', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 5 },
      { id: 'sl-3', itemId: 'itm-1002', locationId: 'loc-c', locationName: 'Zone C', zone: 'C', qty: 0 },
    ],
  },
  {
    id: 'itm-1001', sku: 'SKU-1001', name: 'Steel Bracket 90°', unit: 'ea', reorderAt: 40, totalQty: 128,
    description: 'Zinc-plated mounting bracket, 4mm gauge.',
    stockLevels: [
      { id: 'sl-4', itemId: 'itm-1001', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 74 },
      { id: 'sl-5', itemId: 'itm-1001', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 54 },
    ],
  },
  {
    id: 'itm-1007', sku: 'SKU-1007', name: 'Thermal Labels 4x6', unit: 'pack', reorderAt: 12, totalQty: 0,
    description: '250 direct-thermal labels per pack.',
    stockLevels: [],
  },
];

export const PREVIEW_STOCK_LEVELS: StockLevelRow[] = [
  { id: 'sl-1', itemId: 'itm-1002', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 7 },
  { id: 'sl-2', itemId: 'itm-1002', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 5 },
  { id: 'sl-3', itemId: 'itm-1001', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 74 },
  { id: 'sl-4', itemId: 'itm-1001', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 54 },
  { id: 'sl-5', itemId: 'itm-1005', locationId: 'loc-c', locationName: 'Zone C', zone: 'C', qty: 4 },
  { id: 'sl-6', itemId: 'itm-1008', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 120 },
  { id: 'sl-7', itemId: 'itm-1008', locationId: 'loc-c', locationName: 'Zone C', zone: 'C', qty: 90 },
];

export const PREVIEW_MOVEMENTS: Movement[] = [
  { id: 'mv-31', type: 'OUT', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: 'Zone A', toLocName: null, qty: 8, unit: 'box', note: 'Line 3 replenishment', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-04T08:42:00Z' },
  { id: 'mv-30', type: 'IN', itemId: 'itm-1008', itemSku: 'SKU-1008', itemName: 'Cable Ties 300mm', fromLocName: null, toLocName: 'Zone A', qty: 40, unit: 'bag', note: 'PO-4482 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-04T07:55:00Z' },
  { id: 'mv-29', type: 'TRANSFER', itemId: 'itm-1004', itemSku: 'SKU-1004', itemName: 'Packing Tape 48mm', fromLocName: 'Zone C', toLocName: 'Zone B', qty: 24, unit: 'roll', note: 'Pack bench top-up', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-03T17:20:00Z' },
  { id: 'mv-27', type: 'TRANSFER', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: 'Zone B', toLocName: 'Zone A', qty: 5, unit: 'box', note: 'Rebalance after count', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-03T16:05:00Z' },
  { id: 'mv-26', type: 'OUT', itemId: 'itm-1005', itemSku: 'SKU-1005', itemName: 'Pallet Wrap 500mm', fromLocName: 'Zone C', toLocName: null, qty: 6, unit: 'roll', note: 'Outbound wrapping', userEmail: 'priya.shah@stockroom.example', createdAt: '2026-09-03T11:12:00Z' },
  { id: 'mv-24', type: 'IN', itemId: 'itm-1006', itemSku: 'SKU-1006', itemName: 'Safety Goggles', fromLocName: null, toLocName: 'Zone B', qty: 24, unit: 'ea', note: 'PO-4479 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-02T15:44:00Z' },
  { id: 'mv-22', type: 'OUT', itemId: 'itm-1003', itemSku: 'SKU-1003', itemName: 'Nitrile Gloves (L)', fromLocName: 'Zone A', toLocName: null, qty: 12, unit: 'box', note: 'Weekly floor issue', userEmail: 'priya.shah@stockroom.example', createdAt: '2026-09-02T13:02:00Z' },
  { id: 'mv-19', type: 'IN', itemId: 'itm-1002', itemSku: 'SKU-1002', itemName: 'Hex Bolt M8 x 40', fromLocName: null, toLocName: 'Zone B', qty: 10, unit: 'box', note: 'PO-4471 delivery', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-02T10:18:00Z' },
  { id: 'mv-16', type: 'TRANSFER', itemId: 'itm-1008', itemSku: 'SKU-1008', itemName: 'Cable Ties 300mm', fromLocName: 'Zone A', toLocName: 'Zone C', qty: 30, unit: 'bag', note: 'Overflow to Zone C', userEmail: 'dana.ruiz@stockroom.example', createdAt: '2026-09-01T16:40:00Z' },
  { id: 'mv-12', type: 'IN', itemId: 'itm-1001', itemSku: 'SKU-1001', itemName: 'Steel Bracket 90°', fromLocName: null, toLocName: 'Zone A', qty: 60, unit: 'ea', note: 'PO-4468 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-09-01T09:30:00Z' },
  { id: 'mv-09', type: 'OUT', itemId: 'itm-1004', itemSku: 'SKU-1004', itemName: 'Packing Tape 48mm', fromLocName: 'Zone B', toLocName: null, qty: 18, unit: 'roll', note: 'Pack bench issue', userEmail: 'priya.shah@stockroom.example', createdAt: '2026-08-31T14:05:00Z' },
  { id: 'mv-05', type: 'IN', itemId: 'itm-1003', itemSku: 'SKU-1003', itemName: 'Nitrile Gloves (L)', fromLocName: null, toLocName: 'Zone A', qty: 42, unit: 'box', note: 'PO-4460 delivery', userEmail: 'sam.okafor@stockroom.example', createdAt: '2026-08-31T09:15:00Z' },
];

export const PREVIEW_LOW_STOCK: LowStockRow[] = [
  { id: 'itm-1007', sku: 'SKU-1007', name: 'Thermal Labels 4x6', unit: 'pack', reorderAt: 12, totalQty: 0 },
  { id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12 },
  { id: 'itm-1005', sku: 'SKU-1005', name: 'Pallet Wrap 500mm', unit: 'roll', reorderAt: 15, totalQty: 4 },
  { id: 'itm-1003', sku: 'SKU-1003', name: 'Nitrile Gloves (L)', unit: 'box', reorderAt: 30, totalQty: 30 },
];

export const PREVIEW_SETTINGS: AdminSetting[] = [
  { key: 'DATABASE_URL', service: 'postgresql', label: 'Connection string', value: 'postgresql://stockroom:••••••••@app-db:5432/stockroom', configured: true, secret: true },
  { key: 'MINIO_ENDPOINT', service: 'minio', label: 'Endpoint', value: 'http://minio:9000', configured: true, secret: false },
  { key: 'MINIO_ACCESS_KEY', service: 'minio', label: 'Access key', value: 'stockroom-••••', configured: true, secret: true },
  { key: 'MINIO_SECRET_KEY', service: 'minio', label: 'Secret key', value: '', configured: false, secret: true },
  { key: 'MINIO_BUCKET', service: 'minio', label: 'Bucket', value: '', configured: false, secret: false },
];
