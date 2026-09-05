import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateItemDto } from './dto/create-item.dto';
import type { UpdateItemDto } from './dto/update-item.dto';

/** Mirrors `frontend/src/app/core/models.ts#Item`. */
export interface ItemDto {
  id: string;
  sku: string;
  name: string;
  description?: string;
  unit: string;
  reorderAt: number;
  totalQty: number;
}

/** Mirrors `models.ts#StockLevelRow`. */
export interface StockLevelRowDto {
  id: string;
  itemId: string;
  locationId: string;
  locationName: string;
  zone: string;
  qty: number;
}

/** Mirrors `models.ts#ItemDetail`. */
export interface ItemDetailDto extends ItemDto {
  stockLevels: StockLevelRowDto[];
}

type ItemRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  reorderAt: number;
};

const ITEM_SELECT = {
  id: true,
  sku: true,
  name: true,
  description: true,
  unit: true,
  reorderAt: true,
} as const;

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One catalogue query plus one aggregate, merged in memory: an item with no
   * StockLevel rows at all is absent from the groupBy result and must still
   * report `totalQty: 0` rather than being dropped from the list.
   */
  async findAll(q?: string): Promise<ItemDto[]> {
    const term = q?.trim();
    const items = await this.prisma.item.findMany({
      where: term
        ? {
            OR: [
              { sku: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: ITEM_SELECT,
      orderBy: { sku: 'asc' },
    });

    const totals = await this.totalsByItem(items.map((item) => item.id));
    return items.map((item) => this.toItemDto(item, totals.get(item.id) ?? 0));
  }

  /**
   * The per-location breakdown and the header total come from the same rows, so
   * "the breakdown sums to the total" holds by construction, not by convention.
   */
  async findOne(id: string): Promise<ItemDetailDto> {
    const item = await this.prisma.item.findUnique({
      where: { id },
      select: {
        ...ITEM_SELECT,
        stockLevels: {
          select: {
            id: true,
            itemId: true,
            locationId: true,
            qty: true,
            location: { select: { name: true, zone: true } },
          },
          orderBy: { location: { name: 'asc' } },
        },
      },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const stockLevels: StockLevelRowDto[] = item.stockLevels.map((level) => ({
      id: level.id,
      itemId: level.itemId,
      locationId: level.locationId,
      locationName: level.location.name,
      zone: level.location.zone,
      qty: level.qty,
    }));
    const totalQty = stockLevels.reduce((sum, level) => sum + level.qty, 0);

    return { ...this.toItemDto(item, totalQty), stockLevels };
  }

  async create(dto: CreateItemDto): Promise<ItemDto> {
    // A duplicate SKU surfaces as Prisma P2002 and is translated to a 400
    // field error by PrismaExceptionFilter — no pre-read, so no race window.
    const item = await this.prisma.item.create({
      data: {
        sku: dto.sku.trim(),
        name: dto.name.trim(),
        unit: dto.unit.trim(),
        description: dto.description?.trim() || null,
        reorderAt: dto.reorderAt,
      },
      select: ITEM_SELECT,
    });
    return this.toItemDto(item, 0);
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemDto> {
    await this.assertExists(id);
    const item = await this.prisma.item.update({
      where: { id },
      data: {
        sku: dto.sku?.trim(),
        name: dto.name?.trim(),
        unit: dto.unit?.trim(),
        reorderAt: dto.reorderAt,
        ...(dto.description === undefined
          ? {}
          : { description: dto.description.trim() || null }),
      },
      select: ITEM_SELECT,
    });
    const totals = await this.totalsByItem([id]);
    return this.toItemDto(item, totals.get(id) ?? 0);
  }

  /**
   * Deleting an item that movements reference would tear a hole in the audit
   * log, so it is refused instead of cascading.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);

    const movements = await this.prisma.movement.count({ where: { itemId: id } });
    if (movements > 0) {
      throw new ConflictException(
        `This item has ${movements} movement${movements === 1 ? '' : 's'} in the audit log and cannot be deleted.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.stockLevel.deleteMany({ where: { itemId: id } }),
      this.prisma.item.delete({ where: { id } }),
    ]);
  }

  /** Shared by the items list and the low-stock report. */
  async totalsByItem(itemIds?: string[]): Promise<Map<string, number>> {
    const grouped = await this.prisma.stockLevel.groupBy({
      by: ['itemId'],
      where: itemIds ? { itemId: { in: itemIds } } : undefined,
      _sum: { qty: true },
    });
    return new Map(grouped.map((row) => [row.itemId, row._sum.qty ?? 0]));
  }

  private toItemDto(item: ItemRow, totalQty: number): ItemDto {
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      reorderAt: item.reorderAt,
      totalQty,
      ...(item.description === null ? {} : { description: item.description }),
    };
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.item.count({ where: { id } });
    if (found === 0) {
      throw new NotFoundException('Item not found');
    }
  }
}
