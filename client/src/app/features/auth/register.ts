import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { describeError } from '../../core/utils/problem-details';
import { notBlank } from '../../core/utils/validators';
import { BrandLogo } from '../../shared/brand-logo/brand-logo';

// Mirrors the API rule: at least eight characters with a letter and a number.
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  return password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, BrandLogo],
  templateUrl: './register.html',
  styleUrl: './auth.scss',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      displayName: ['', [Validators.required, notBlank, Validators.minLength(2), Validators.maxLength(100)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: [
        '',
        [Validators.required, Validators.minLength(8), Validators.maxLength(100), Validators.pattern(PASSWORD_PATTERN)],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  protected showError(name: 'displayName' | 'email' | 'password' | 'confirmPassword'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected showMismatch(): boolean {
    const confirm = this.form.controls.confirmPassword;
    return this.form.hasError('mismatch') && (confirm.touched || this.submitted()) && !confirm.hasError('required');
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.submitting()) return;

    const { displayName, email, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);

    this.auth.register({ displayName: displayName.trim(), email, password }).subscribe({
      next: () => void this.router.navigateByUrl(this.auth.homeUrl()),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(describeError(error));
      },
    });
  }
}
