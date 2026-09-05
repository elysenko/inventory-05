import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ItemsService } from '../items/items.service';

/** Mirrors `frontend/src/app/core/models.ts#LowStockRow`. */
export interface LowStockRowDto {
  id: string;
  sku: string;
  name: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
  ) {}

  /**
   * An item is low when its on-hand total is at or below its reorder threshold.
   *
   * The filter runs in memory rather than in SQL because an item with no
   * StockLevel rows at all has no aggregate row to compare against — it is the
   * most urgent case (zero on hand) and a join-based query would drop it.
   * Ordered by shortfall, so the deepest hole is at the top.
   */
  async lowStock(): Promise<LowStockRowDto[]> {
    const items = await this.prisma.item.findMany({
      select: { id: true, sku: true, name: true, unit: true, reorderAt: true },
    });
    const totals = await this.items.totalsByItem();

    return items
      .map((item) => ({ ...item, totalQty: totals.get(item.id) ?? 0 }))
      .filter((row) => row.totalQty <= row.reorderAt)
      .sort((a, b) => a.totalQty - a.reorderAt - (b.totalQty - b.reorderAt));
  }
}
