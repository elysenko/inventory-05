import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import type { CreateMovementDto } from './dto/create-movement.dto';
import type { QueryMovementsDto } from './dto/query-movements.dto';

/** Mirrors `frontend/src/app/core/models.ts#Movement`. */
export interface MovementDto {
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

/** Mirrors `models.ts#MovementPage`. */
export interface MovementPageDto {
  data: MovementDto[];
  total: number;
  page: number;
  pageSize: number;
}

const MOVEMENT_INCLUDE = {
  item: { select: { sku: true, name: true, unit: true } },
  fromLoc: { select: { name: true } },
  toLoc: { select: { name: true } },
  user: { select: { email: true } },
} satisfies Prisma.MovementInclude;

type MovementRow = Prisma.MovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;

const DEFAULT_PAGE_SIZE = 50;
const ITEM_HISTORY_LIMIT = 100;

/** A bare `YYYY-MM-DD` upper bound means "through the end of that day". */
function endOfRange(value: string): Date {
  const parsed = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a stock movement and applies its balance changes atomically.
   *
   * The debit is a conditional `updateMany` with `qty >= n` in the WHERE clause
   * rather than a read-then-write: two concurrent OUTs can therefore never both
   * pass the check and drive a balance negative. `count === 0` means either the
   * row is missing or it holds too little, and both are the same 400 to a user.
   *
   * The Movement row is written last inside the same transaction, so a rejected
   * draw leaves neither a balance change nor an audit entry behind.
   */
  async create(dto: CreateMovementDto, user: AuthUser): Promise<MovementDto> {
    const fromLocId = dto.fromLocId ?? null;
    const toLocId = dto.toLocId ?? null;
    this.assertShape(dto.type, fromLocId, toLocId);

    const row = await this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { id: dto.itemId }, select: { id: true } });
      if (!item) {
        throw new NotFoundException('Item not found');
      }

      const locationIds = [...new Set([fromLocId, toLocId].filter((id): id is string => !!id))];
      const found = await tx.location.count({ where: { id: { in: locationIds } } });
      if (found !== locationIds.length) {
        throw new NotFoundException('Location not found');
      }

      if (fromLocId) {
        const debited = await tx.stockLevel.updateMany({
          where: { itemId: dto.itemId, locationId: fromLocId, qty: { gte: dto.qty } },
          data: { qty: { decrement: dto.qty } },
        });
        if (debited.count === 0) {
          throw new BadRequestException('Insufficient stock at the source location');
        }
      }

      if (toLocId) {
        await tx.stockLevel.upsert({
          where: { itemId_locationId: { itemId: dto.itemId, locationId: toLocId } },
          create: { itemId: dto.itemId, locationId: toLocId, qty: dto.qty },
          update: { qty: { increment: dto.qty } },
        });
      }

      return tx.movement.create({
        data: {
          type: dto.type,
          itemId: dto.itemId,
          fromLocId,
          toLocId,
          qty: dto.qty,
          note: dto.note?.trim() || null,
          userId: user.id,
        },
        include: MOVEMENT_INCLUDE,
      });
    });

    return this.toDto(row);
  }

  /** Paginated, filterable audit log. Newest first. */
  async findAll(query: QueryMovementsDto): Promise<MovementPageDto> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE;

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      createdAt.gte = new Date(query.from);
    }
    if (query.to) {
      createdAt.lte = endOfRange(query.to);
    }

    const where: Prisma.MovementWhereInput = {
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.movement.count({ where }),
      this.prisma.movement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map((row) => this.toDto(row)), total, page, pageSize };
  }

  /** History for one item, used by the item detail screen's Movements tab. */
  async findForItem(itemId: string): Promise<MovementDto[]> {
    const item = await this.prisma.item.count({ where: { id: itemId } });
    if (item === 0) {
      throw new NotFoundException('Item not found');
    }
    const rows = await this.prisma.movement.findMany({
      where: { itemId },
      include: MOVEMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: ITEM_HISTORY_LIMIT,
    });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Per-type location requirements. Rejecting the nonsensical combinations up
   * front keeps the transaction body to just the balance arithmetic.
   */
  private assertShape(
    type: MovementType,
    fromLocId: string | null,
    toLocId: string | null,
  ): void {
    if (type === MovementType.IN) {
      if (!toLocId) {
        throw new BadRequestException('A receipt needs a destination location');
      }
      if (fromLocId) {
        throw new BadRequestException('A receipt cannot have a source location');
      }
      return;
    }

    if (type === MovementType.OUT) {
      if (!fromLocId) {
        throw new BadRequestException('An issue needs a source location');
      }
      if (toLocId) {
        throw new BadRequestException('An issue cannot have a destination location');
      }
      return;
    }

    if (!fromLocId || !toLocId) {
      throw new BadRequestException('A transfer needs both a source and a destination location');
    }
    if (fromLocId === toLocId) {
      throw new BadRequestException('Source and destination locations must be different');
    }
  }

  private toDto(row: MovementRow): MovementDto {
    return {
      id: row.id,
      type: row.type,
      itemId: row.itemId,
      itemSku: row.item.sku,
      itemName: row.item.name,
      fromLocName: row.fromLoc?.name ?? null,
      toLocName: row.toLoc?.name ?? null,
      qty: row.qty,
      unit: row.item.unit,
      note: row.note,
      userEmail: row.user.email,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
