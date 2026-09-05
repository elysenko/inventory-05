import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './auth.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Always null: there is no credential-free sign-in. Kept because the locked
   * template guards the (never-rendered) shortcut button on it.
   */
  protected readonly previewShortcut: string | null = null;

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]],
  });

  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') || '/items';
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Enter your work email and password to continue.');
      return;
    }
    this.submitting.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      await this.router.navigateByUrl(this.returnUrl());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Sign in failed. Try again.');
    } finally {
      this.submitting.set(false);
    }
  }

  /** Unreachable: `previewShortcut` is null, so the button never renders. */
  protected demoSignIn(): void {
    /* every session is established by POST /api/auth/{login,signup} */
  }

  protected invalid(control: 'email' | 'password'): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }
}
