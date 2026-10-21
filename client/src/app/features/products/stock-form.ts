import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { ProductsApi } from '../../core/api/products.api';
import { Product } from '../../core/models/api.models';
import { integer } from '../../core/utils/validators';

type Mode = 'adjust' | 'set';

@Component({
  selector: 'app-stock-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <p class="current">
        Currently <strong>{{ product().availableQuantity }}</strong> in stock.
      </p>

      <div class="modes" role="group" aria-label="Stock action">
        <button type="button" class="btn btn-sm" [attr.aria-pressed]="mode() === 'adjust'" (click)="setMode('adjust')">
          Add / remove
        </button>
        <button type="button" class="btn btn-sm" [attr.aria-pressed]="mode() === 'set'" (click)="setMode('set')">
          Set exact amount
        </button>
      </div>

      <div class="field">
        <label for="stock-amount">{{ mode() === 'adjust' ? 'Change by' : 'New quantity' }}</label>
        <input
          id="stock-amount"
          class="input"
          type="number"
          step="1"
          formControlName="amount"
          [placeholder]="mode() === 'adjust' ? 'e.g. 25 or -5' : 'e.g. 100'"
        />
        @if (outcome() !== null) {
          <span class="hint" [class.error]="negative()">
            @if (negative()) {
              That would leave less than zero in stock.
            } @else {
              New quantity: {{ outcome() }}
            }
          </span>
        }
      </div>

      <div class="actions">
        <button type="submit" class="btn btn-primary" [disabled]="!canSubmit() || saving()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .current {
      margin: 0;
    }
    .modes {
      display: flex;
      gap: 0.5rem;
    }
    .modes .btn[aria-pressed='true'] {
      background: var(--primary-soft);
      border-color: var(--primary);
      color: var(--primary);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class StockForm {
  private readonly api = inject(ProductsApi);

  readonly product = input.required<Product>();
  readonly saved = output<Product>();

  protected readonly mode = signal<Mode>('adjust');
  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    amount: new FormControl<number | null>(null, [Validators.required, integer]),
  });

  private readonly amountValue = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.value,
  });

  // Resulting stock level for the entered amount, or null while nothing valid is entered.
  protected readonly outcome = computed(() => {
    const value = this.amountValue();
    if (value === null || !Number.isInteger(value)) return null;
    return this.mode() === 'adjust' ? this.product().availableQuantity + value : value;
  });

  protected readonly negative = computed(() => (this.outcome() ?? 0) < 0);
  protected readonly canSubmit = computed(() => this.outcome() !== null && !this.negative());

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.form.controls.amount.reset(null);
  }

  protected submit(): void {
    const value = this.amountValue();
    if (!this.canSubmit() || value === null || this.saving()) return;

    const { id } = this.product();
    const request: Observable<Product> =
      this.mode() === 'adjust' ? this.api.adjustStock(id, value) : this.api.setStock(id, value);

    this.saving.set(true);
    request.subscribe({
      next: (product) => {
        this.saving.set(false);
        this.saved.emit(product);
      },
      error: () => this.saving.set(false),
    });
  }
}
