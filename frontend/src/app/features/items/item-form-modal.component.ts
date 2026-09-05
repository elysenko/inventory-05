import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Item } from '../../core/models';

@Component({
  selector: 'app-item-form-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './item-form-modal.component.html',
  styleUrl: './item-form-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemFormModalComponent {
  private readonly fb = inject(FormBuilder);

  /** SKUs already in use — drives the field-scoped duplicate error the API returns as a 400. */
  @Input() takenSkus: string[] = [];
  @Output() readonly dismiss = new EventEmitter<void>();
  @Output() readonly save = new EventEmitter<Partial<Item>>();

  protected readonly editing = signal(false);
  protected readonly skuError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    sku: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{3,}$/)]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    unit: ['ea', [Validators.required]],
    reorderAt: [0, [Validators.required, Validators.min(0)]],
    description: [''],
  });

  protected readonly units = ['ea', 'box', 'roll', 'pack', 'bag', 'kg', 'm'];

  /**
   * Message returned by the API for this form (for example a duplicate SKU
   * rejected as a 400). Rendered in the modal's alert so the typed values stay
   * on screen instead of the dialog closing on a failed save.
   */
  @Input() set serverError(value: string | null) {
    this.skuError.set(value);
  }

  @Input() set item(value: Item | null) {
    this.editing.set(!!value);
    if (value) {
      this.form.patchValue({
        sku: value.sku,
        name: value.name,
        unit: value.unit,
        reorderAt: value.reorderAt,
        description: value.description ?? '',
      });
    }
  }

  protected submit(): void {
    this.skuError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const duplicate = this.takenSkus.some(
      (sku) => sku.toLowerCase() === value.sku.trim().toLowerCase(),
    );
    if (duplicate && !this.editing()) {
      this.skuError.set(`SKU ${value.sku.toUpperCase()} is already in use.`);
      return;
    }
    this.save.emit({
      sku: value.sku.trim().toUpperCase(),
      name: value.name.trim(),
      unit: value.unit,
      reorderAt: Number(value.reorderAt),
      description: value.description.trim() || undefined,
    });
  }

  protected invalid(control: 'sku' | 'name' | 'unit' | 'reorderAt'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }
}
