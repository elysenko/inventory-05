import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './auth.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * Always null: there is no credential-free sign-in. Kept because the locked
   * template guards the (never-rendered) shortcut button on it.
   */
  protected readonly previewShortcut: string | null = null;

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(
        this.form.hasError('mismatch')
          ? 'Those passwords do not match.'
          : 'Fill in every field to create your account.',
      );
      return;
    }
    this.submitting.set(true);
    try {
      const { name, email, password } = this.form.getRawValue();
      await this.auth.signup(name, email, password);
      await this.router.navigateByUrl('/items');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Sign up failed. Try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  /** Unreachable: `previewShortcut` is null, so the button never renders. */
  protected demoSignIn(): void {
    /* every session is established by POST /api/auth/{login,signup} */
  }

  protected invalid(control: 'name' | 'email' | 'password' | 'confirm'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }
}
