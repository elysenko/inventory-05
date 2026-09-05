import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ItemsApi } from '../../core/api/items-api.service';
import { LocationsApi } from '../../core/api/locations-api.service';
import { MovementsApi } from '../../core/api/movements-api.service';
import { Item, Location, MovementType, StockLevelRow } from '../../core/models';

@Component({
  selector: 'app-movement-new',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './movement-new.component.html',
  styleUrl: './movement-new.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementNewComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly itemsApi = inject(ItemsApi);
  private readonly locationsApi = inject(LocationsApi);
  private readonly movementsApi = inject(MovementsApi);

  /** `GET /api/items` — populates the item select. */
  readonly items = signal<Item[]>([]);

  /** `GET /api/locations` — populates the source/destination selects. */
  readonly locations = signal<Location[]>([]);

  /**
   * Per-location balances for the selected item, from `GET /api/items/:id`.
   * They drive the "available here" hint and the inline over-draw guard; the
   * authoritative check still happens server-side inside the transaction.
   */
  readonly stockLevels = signal<StockLevelRow[]>([]);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);

  /** Suppresses the local over-draw guard until real balances have arrived. */
  private readonly levelsLoaded = signal(false);
  private loadedFor = '';

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
    const destroyRef = inject(DestroyRef);
    const sub = this.form.valueChanges.subscribe(() => {
      this.formVersion.update((v) => v + 1);
      void this.syncStockLevels();
    });
    destroyRef.onDestroy(() => sub.unsubscribe());
  }

  ngOnInit(): void {
    void this.loadReferenceData();
  }

  /** Catalogue and locations are independent reads, so they go out together. */
  private async loadReferenceData(): Promise<void> {
    try {
      const [items, locations] = await Promise.all([
        this.itemsApi.list(),
        this.locationsApi.list(),
      ]);
      this.items.set(items);
      this.locations.set(locations);
      if (!this.form.controls.itemId.value && items.length > 0) {
        this.form.patchValue({ itemId: items[0].id });
      }
      await this.syncStockLevels();
    } catch (err) {
      this.error.set(messageOf(err));
    }
  }

  /** Refetches balances whenever the chosen item changes. */
  private async syncStockLevels(): Promise<void> {
    const itemId = this.form.controls.itemId.value;
    if (!itemId || itemId === this.loadedFor) {
      return;
    }
    this.loadedFor = itemId;
    this.levelsLoaded.set(false);
    try {
      const detail = await this.itemsApi.get(itemId);
      this.stockLevels.set(detail.stockLevels);
      this.levelsLoaded.set(true);
    } catch {
      // A failed balance read must not block recording: the server re-checks.
      this.stockLevels.set([]);
    }
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

  protected async submit(): Promise<void> {
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
    if (this.needsSource() && this.levelsLoaded() && value.qty > available) {
      this.error.set(
        `Insufficient stock at source location — only ${available} ${item?.unit ?? 'units'} on hand there.`,
      );
      return;
    }

    this.submitting.set(true);
    try {
      // The API applies the debit/credit and writes the audit row in one
      // transaction, so a rejected draw leaves the balance untouched.
      await this.movementsApi.create({
        type: value.type,
        itemId: value.itemId,
        fromLocId: value.fromLocId || undefined,
        toLocId: value.toLocId || undefined,
        qty: Number(value.qty),
        note: value.note.trim() || undefined,
      });
      this.success.set(
        `${value.type === 'IN' ? 'Received' : value.type === 'OUT' ? 'Issued' : 'Transferred'} ` +
          `${value.qty} ${item?.unit ?? ''} of ${item?.name ?? 'item'}.`,
      );
      this.form.patchValue({ qty: 1, note: '' });
      await this.refreshAfterMovement();
    } catch (err) {
      // Renders the API's own 400 text (e.g. "Insufficient stock at the source
      // location") rather than a generic failure message.
      this.error.set(messageOf(err));
    } finally {
      this.submitting.set(false);
    }
  }

  /** Pulls the new balances back so the next submit is checked against truth. */
  private async refreshAfterMovement(): Promise<void> {
    this.loadedFor = '';
    try {
      this.items.set(await this.itemsApi.list());
    } catch {
      /* the totals hint is cosmetic; a failed refresh must not blank the form */
    }
    await this.syncStockLevels();
  }

  protected invalid(control: 'itemId' | 'qty'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
