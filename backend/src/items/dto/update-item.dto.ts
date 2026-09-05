import { PartialType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

/** Every field optional — PATCH semantics; omitted keys are left untouched. */
export class UpdateItemDto extends PartialType(CreateItemDto) {}
