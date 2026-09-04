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
import { Location } from '../../core/models';

@Component({
  selector: 'app-location-form-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './location-form-modal.component.html',
  styleUrl: './location-form-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationFormModalComponent {
  private readonly fb = inject(FormBuilder);

  /** Names already in use — mirrors the API's field-scoped duplicate-name 400. */
  @Input() takenNames: string[] = [];
  @Output() readonly dismiss = new EventEmitter<void>();
  @Output() readonly save = new EventEmitter<Partial<Location>>();

  protected readonly editing = signal(false);
  protected readonly nameError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    zone: ['', [Validators.required, Validators.maxLength(4)]],
  });

  @Input() set location(value: Location | null) {
    this.editing.set(!!value);
    if (value) {
      this.form.patchValue({ name: value.name, zone: value.zone });
    }
  }

  protected submit(): void {
    this.nameError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const duplicate = this.takenNames.some(
      (name) => name.toLowerCase() === value.name.trim().toLowerCase(),
    );
    if (duplicate && !this.editing()) {
      this.nameError.set(`A location called “${value.name.trim()}” already exists.`);
      return;
    }
    this.save.emit({ name: value.name.trim(), zone: value.zone.trim().toUpperCase() });
  }

  protected invalid(control: 'name' | 'zone'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }
}
