import { AbstractControl, ValidationErrors } from '@angular/forms';

// Rejects values that only contain whitespace; Validators.required lets those through.
export function notBlank(control: AbstractControl<string | null>): ValidationErrors | null {
  const value = control.value;
  return typeof value === 'string' && value.trim().length === 0 ? { blank: true } : null;
}

// Accepts empty values (use Validators.required for that) and rejects fractions.
export function integer(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || value === undefined || Number.isInteger(value) ? null : { integer: true };
}
