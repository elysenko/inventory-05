import { IsObject } from 'class-validator';

export class UpdateSettingsDto {
  /**
   * Sparse map of setting key -> new value. Only the keys present are written;
   * an empty string clears the override and falls back to the pod environment.
   */
  @IsObject()
  values!: Record<string, string>;
}
