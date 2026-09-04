import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Item, Location, MovementType, StockLevelRow } from '../../core/models';

@Component({
  selector: 'app-movement-new',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './movement-new.component.html',
  styleUrl: './movement-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementNewComponent {
  private readonly fb = inject(FormBuilder);

  /** Backend-owned data: catalogue used to populate the item select. */
  readonly items = signal<Item[]>([
    { id: 'itm-1001', sku: 'SKU-1001', name: 'Steel Bracket 90°', unit: 'ea', reorderAt: 40, totalQty: 128 },
    { id: 'itm-1002', sku: 'SKU-1002', name: 'Hex Bolt M8 x 40', unit: 'box', reorderAt: 25, totalQty: 12 },
    { id: 'itm-1003', sku: 'SKU-1003', name: 'Nitrile Gloves (L)', unit: 'box', reorderAt: 30, totalQty: 30 },
    { id: 'itm-1004', sku: 'SKU-1004', name: 'Packing Tape 48mm', unit: 'roll', reorderAt: 20, totalQty: 96 },
    { id: 'itm-1005', sku: 'SKU-1005', name: 'Pallet Wrap 500mm', unit: 'roll', reorderAt: 15, totalQty: 4 },
    { id: 'itm-1006', sku: 'SKU-1006', name: 'Safety Goggles', unit: 'ea', reorderAt: 10, totalQty: 54 },
    { id: 'itm-1007', sku: 'SKU-1007', name: 'Thermal Labels 4x6', unit: 'pack', reorderAt: 12, totalQty: 0 },
    { id: 'itm-1008', sku: 'SKU-1008', name: 'Cable Ties 300mm', unit: 'bag', reorderAt: 25, totalQty: 210 },
  ]);

  /** Backend-owned data: storage locations for the from/to selects. */
  readonly locations = signal<Location[]>([
    { id: 'loc-a', name: 'Zone A', zone: 'A', itemCount: 6, totalQty: 246 },
    { id: 'loc-b', name: 'Zone B', zone: 'B', itemCount: 5, totalQty: 178 },
    { id: 'loc-c', name: 'Zone C', zone: 'C', itemCount: 3, totalQty: 110 },
  ]);

  /** Backend-owned data: per-location balances, so over-draws are caught before submit. */
  readonly stockLevels = signal<StockLevelRow[]>([
    { id: 'sl-1', itemId: 'itm-1002', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 7 },
    { id: 'sl-2', itemId: 'itm-1002', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 5 },
    { id: 'sl-3', itemId: 'itm-1001', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 74 },
    { id: 'sl-4', itemId: 'itm-1001', locationId: 'loc-b', locationName: 'Zone B', zone: 'B', qty: 54 },
    { id: 'sl-5', itemId: 'itm-1005', locationId: 'loc-c', locationName: 'Zone C', zone: 'C', qty: 4 },
    { id: 'sl-6', itemId: 'itm-1008', locationId: 'loc-a', locationName: 'Zone A', zone: 'A', qty: 120 },
    { id: 'sl-7', itemId: 'itm-1008', locationId: 'loc-c', locationName: 'Zone C', zone: 'C', qty: 90 },
  ]);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  protected readonly types: { value: MovementType; label: string; hint: string }[] = [
    { value: 'IN', label: 'Receive in', hint: 'Adds stock to a destination location.' },
    { value: 'OUT', label: 'Issue out', hint: 'Removes stock from a source location.' },
    { value: 'TRANSFER', label: 'Transfer', hint: 'Moves stock between two locations; the total is unchanged.' },
  ];

  protected readonly form = this.fb.nonNullable.group({
    itemId: ['', [Validators.required]],
    type: ['IN' as MovementType, [Validators.required]],
    fromLocId: [''],
    toLocId: [''],
    qty: [1, [Validators.required, Validators.min(1)]],
    note: [''],
  });

  private readonly formVersion = signal(0);

  constructor() {
    this.form.valueChanges.subscribe(() => this.formVersion.update((v) => v + 1));
  }

  @Input() set itemId(value: string | null) {
    if (value) {
      this.form.patchValue({ itemId: value });
    } else if (!this.form.controls.itemId.value) {
      this.form.patchValue({ itemId: this.items()[0]?.id ?? '' });
    }
  }

  @Input() set type(value: string | null) {
    const allowed: MovementType[] = ['IN', 'OUT', 'TRANSFER'];
    if (value && allowed.includes(value as MovementType)) {
      this.form.patchValue({ type: value as MovementType });
    }
  }

  protected readonly movementType = computed<MovementType>(() => {
    this.formVersion();
    return this.form.controls.type.value;
  });

  protected readonly needsSource = computed(() => this.movementType() !== 'IN');
  protected readonly needsDestination = computed(() => this.movementType() !== 'OUT');

  protected readonly selectedItem = computed<Item | null>(() => {
    this.formVersion();
    return this.items().find((i) => i.id === this.form.controls.itemId.value) ?? null;
  });

  protected readonly typeHint = computed(
    () => this.types.find((t) => t.value === this.movementType())?.hint ?? '',
  );

  /** On-hand at the chosen source, used for the inline over-draw guard. */
  protected readonly availableAtSource = computed<number>(() => {
    this.formVersion();
    const { itemId, fromLocId } = this.form.getRawValue();
    if (!itemId || !fromLocId) {
      return 0;
    }
    return (
      this.stockLevels().find((s) => s.itemId === itemId && s.locationId === fromLocId)?.qty ?? 0
    );
  });

  protected submit(): void {
    this.error.set(null);
    this.success.set(null);
    const value = this.form.getRawValue();

    if (this.form.invalid || !value.itemId) {
      this.form.markAllAsTouched();
      this.error.set('Choose an item and a quantity of at least 1.');
      return;
    }
    if (this.needsSource() && !value.fromLocId) {
      this.error.set('Choose the location the stock is leaving.');
      return;
    }
    if (this.needsDestination() && !value.toLocId) {
      this.error.set('Choose the location the stock is going to.');
      return;
    }
    if (value.type === 'TRANSFER' && value.fromLocId === value.toLocId) {
      this.error.set('A transfer needs two different locations.');
      return;
    }

    const item = this.selectedItem();
    const available = this.availableAtSource();
    if (this.needsSource() && value.qty > available) {
      this.error.set(
        `Insufficient stock at source location — only ${available} ${item?.unit ?? 'units'} on hand there.`,
      );
      return;
    }

    this.submitting.set(true);
    this.applyMovement(value.itemId, value.type, value.fromLocId, value.toLocId, value.qty);
    this.success.set(
      `${value.type === 'IN' ? 'Received' : value.type === 'OUT' ? 'Issued' : 'Transferred'} ` +
        `${value.qty} ${item?.unit ?? ''} of ${item?.name ?? 'item'}.`,
    );
    this.form.patchValue({ qty: 1, note: '' });
    this.submitting.set(false);
  }

  /** Mirrors the API's transactional balance update so the preview stays coherent. */
  private applyMovement(
    itemId: string,
    type: MovementType,
    fromLocId: string,
    toLocId: string,
    qty: number,
  ): void {
    this.stockLevels.update((rows) => {
      let next = rows.map((row) =>
        row.itemId === itemId && row.locationId === fromLocId && type !== 'IN'
          ? { ...row, qty: row.qty - qty }
          : row,
      );
      if (type !== 'OUT') {
        const existing = next.find((r) => r.itemId === itemId && r.locationId === toLocId);
        if (existing) {
          next = next.map((r) => (r === existing ? { ...r, qty: r.qty + qty } : r));
        } else {
          const location = this.locations().find((l) => l.id === toLocId);
          next = [
            ...next,
            {
              id: `sl-new-${next.length + 1}`,
              itemId,
              locationId: toLocId,
              locationName: location?.name ?? 'Unknown',
              zone: location?.zone ?? '—',
              qty,
            },
          ];
        }
      }
      return next;
    });

    const delta = type === 'IN' ? qty : type === 'OUT' ? -qty : 0;
    if (delta !== 0) {
      this.items.update((rows) =>
        rows.map((row) => (row.id === itemId ? { ...row, totalQty: row.totalQty + delta } : row)),
      );
    }
  }

  protected invalid(control: 'itemId' | 'qty'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }
}
