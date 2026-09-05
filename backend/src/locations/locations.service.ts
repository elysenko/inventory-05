import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLocationDto } from './dto/create-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

/** Mirrors `frontend/src/app/core/models.ts#Location`. */
export interface LocationDto {
  id: string;
  name: string;
  zone: string;
  itemCount: number;
  totalQty: number;
}

const LOCATION_SELECT = { id: true, name: true, zone: true } as const;

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Readable by any signed-in user: clerks need the location list to fill in
   * the movement form's source/destination selects.
   *
   * Occupancy is aggregated over rows with `qty > 0` only, so a location that
   * once held an item but is now empty reports 0 items rather than a phantom.
   */
  async findAll(): Promise<LocationDto[]> {
    const locations = await this.prisma.location.findMany({
      select: LOCATION_SELECT,
      orderBy: { name: 'asc' },
    });

    const grouped = await this.prisma.stockLevel.groupBy({
      by: ['locationId'],
      where: { qty: { gt: 0 } },
      _sum: { qty: true },
      _count: { _all: true },
    });
    const stats = new Map(
      grouped.map((row) => [row.locationId, { qty: row._sum.qty ?? 0, items: row._count._all }]),
    );

    return locations.map((location) => {
      const stat = stats.get(location.id);
      return {
        ...location,
        itemCount: stat?.items ?? 0,
        totalQty: stat?.qty ?? 0,
      };
    });
  }

  async create(dto: CreateLocationDto): Promise<LocationDto> {
    const location = await this.prisma.location.create({
      data: { name: dto.name.trim(), zone: dto.zone.trim() },
      select: LOCATION_SELECT,
    });
    return { ...location, itemCount: 0, totalQty: 0 };
  }

  async update(id: string, dto: UpdateLocationDto): Promise<LocationDto> {
    await this.assertExists(id);
    await this.prisma.location.update({
      where: { id },
      data: { name: dto.name?.trim(), zone: dto.zone?.trim() },
      select: LOCATION_SELECT,
    });
    const all = await this.findAll();
    const updated = all.find((location) => location.id === id);
    if (!updated) {
      throw new NotFoundException('Location not found');
    }
    return updated;
  }

  /**
   * Refused while the location is referenced by the audit log or still holds
   * stock — deleting either way would silently lose inventory or history.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);

    const movements = await this.prisma.movement.count({
      where: { OR: [{ fromLocId: id }, { toLocId: id }] },
    });
    if (movements > 0) {
      throw new ConflictException(
        `This location appears in ${movements} movement${movements === 1 ? '' : 's'} and cannot be deleted.`,
      );
    }

    const held = await this.prisma.stockLevel.aggregate({
      where: { locationId: id },
      _sum: { qty: true },
    });
    if ((held._sum.qty ?? 0) > 0) {
      throw new ConflictException(
        'This location still holds stock. Move it elsewhere before deleting.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.stockLevel.deleteMany({ where: { locationId: id } }),
      this.prisma.location.delete({ where: { id } }),
    ]);
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.location.count({ where: { id } });
    if (found === 0) {
      throw new NotFoundException('Location not found');
    }
  }
}
