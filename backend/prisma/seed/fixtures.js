'use strict';
/**
 * Business fixtures — inventory catalogue only (NO logins).
 *
 * Runs with plain `node` from the production image, AFTER `seed.js`. Platform
 * accounts belong to `seed.js` (COLOSSUS_ACCOUNTS_JSON); this file only creates
 * the domain data that makes every screen non-empty on first load:
 *
 *   - 3 locations: Zone A / Zone B / Zone C
 *   - 8 items with varied reorder thresholds
 *   - StockLevel rows spread across zones such that
 *       * several items sit comfortably ABOVE their threshold,
 *       * some sit at or below it (low-stock report is never empty),
 *       * one item (SKU-008) has NO stock rows at all, so the "missing sum
 *         defaults to 0" path in the items list / low-stock report is exercised.
 *
 * Idempotent: every write is an `upsert` keyed on a unique column. Existing
 * StockLevel quantities are left ALONE on re-run (`update: {}`) so a pod restart
 * can never clobber balances that real movements have since changed.
 *
 * Non-fatal by design: the container start command chains this after the
 * essential seed, so a transient DB hiccup must never crash-loop the pod. It
 * retries briefly, then logs and exits 0.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CONNECT_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/** name is @unique — the upsert key. */
const LOCATIONS = [
  { name: 'Zone A', zone: 'A' },
  { name: 'Zone B', zone: 'B' },
  { name: 'Zone C', zone: 'C' },
];

/** sku is @unique — the upsert key. */
const ITEMS = [
  { sku: 'SKU-001', name: 'Steel Bolt M8 x 40mm', unit: 'box', reorderAt: 25, description: 'Zinc-plated hex head bolts, 100 per box.' },
  { sku: 'SKU-002', name: 'Hex Nut M8', unit: 'box', reorderAt: 20, description: 'Matching nuts for M8 bolts, 200 per box.' },
  { sku: 'SKU-003', name: 'Nitrile Gloves (L)', unit: 'pack', reorderAt: 15, description: 'Powder-free disposable gloves, 50 pairs per pack.' },
  { sku: 'SKU-004', name: 'Safety Goggles', unit: 'each', reorderAt: 10, description: 'Anti-fog polycarbonate, side-shielded.' },
  { sku: 'SKU-005', name: 'Packing Tape 48mm', unit: 'roll', reorderAt: 30, description: 'Clear acrylic adhesive, 66m per roll.' },
  { sku: 'SKU-006', name: 'Shipping Label 4x6', unit: 'sheet', reorderAt: 50, description: 'Thermal direct labels for the dispatch printers.' },
  { sku: 'SKU-007', name: 'Cable Tie 200mm', unit: 'bag', reorderAt: 12, description: 'UV-resistant nylon ties, 100 per bag.' },
  { sku: 'SKU-008', name: 'Forklift Battery 48V', unit: 'each', reorderAt: 2, description: 'Deep-cycle traction battery — intentionally unstocked.' },
];

/**
 * [sku, locationName, qty]. Totals vs. reorderAt:
 *   SKU-001  70 / 25  above      SKU-002  15 / 20  LOW
 *   SKU-003 100 / 15  above      SKU-004   7 / 10  LOW
 *   SKU-005 165 / 30  above      SKU-006  50 / 50  LOW (boundary: totalQty <= reorderAt)
 *   SKU-007 130 / 12  above      SKU-008   0 /  2  LOW (no rows at all)
 */
const STOCK = [
  ['SKU-001', 'Zone A', 40],
  ['SKU-001', 'Zone B', 30],
  ['SKU-002', 'Zone A', 12],
  ['SKU-002', 'Zone C', 3],
  ['SKU-003', 'Zone A', 60],
  ['SKU-003', 'Zone B', 25],
  ['SKU-003', 'Zone C', 15],
  ['SKU-004', 'Zone B', 7],
  ['SKU-005', 'Zone A', 120],
  ['SKU-005', 'Zone C', 45],
  ['SKU-006', 'Zone A', 50],
  ['SKU-007', 'Zone B', 90],
  ['SKU-007', 'Zone C', 40],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for the migrate job to finish creating the tables before writing. */
async function waitForSchema() {
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt += 1) {
    try {
      await prisma.item.count();
      return;
    } catch (error) {
      if (attempt === CONNECT_RETRIES) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function main() {
  await waitForSchema();

  const locationsByName = new Map();
  for (const location of LOCATIONS) {
    const row = await prisma.location.upsert({
      where: { name: location.name },
      update: { zone: location.zone },
      create: location,
    });
    locationsByName.set(row.name, row.id);
  }

  const itemsBySku = new Map();
  for (const item of ITEMS) {
    const row = await prisma.item.upsert({
      where: { sku: item.sku },
      update: { name: item.name, unit: item.unit, reorderAt: item.reorderAt, description: item.description },
      create: item,
    });
    itemsBySku.set(row.sku, row.id);
  }

  let created = 0;
  for (const [sku, locationName, qty] of STOCK) {
    const itemId = itemsBySku.get(sku);
    const locationId = locationsByName.get(locationName);
    const before = await prisma.stockLevel.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
      select: { id: true },
    });
    if (before) continue; // never overwrite a balance real movements own
    await prisma.stockLevel.create({ data: { itemId, locationId, qty } });
    created += 1;
  }

  console.log(
    `[fixtures] locations=${locationsByName.size} items=${itemsBySku.size} stockLevels+${created} (existing balances untouched)`,
  );
}

main()
  .catch((error) => {
    // Never fail the container start: the app is usable without fixtures.
    console.error(`[fixtures] skipped: ${error.message}`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
