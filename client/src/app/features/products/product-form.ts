import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of, switchMap } from 'rxjs';
import { ProductsApi } from '../../core/api/products.api';
import { Product } from '../../core/models/api.models';
import { MAX_IMAGE_BYTES, validateImage } from '../../core/utils/images';
import { integer, notBlank } from '../../core/utils/validators';

@Component({
  selector: 'app-product-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="product-name">Name</label>
        <input
          id="product-name"
          class="input"
          formControlName="name"
          maxlength="200"
          autocomplete="off"
          [class.invalid]="showError('name')"
        />
        @if (showError('name')) {
          <span class="error">Enter a product name.</span>
        }
      </div>

      <div class="row">
        <div class="field">
          <label for="product-price">Price (USD)</label>
          <input
            id="product-price"
            class="input"
            type="number"
            step="0.01"
            formControlName="price"
            [class.invalid]="showError('price')"
          />
          @if (showError('price')) {
            <span class="error">Enter a price between 0.01 and 1,000,000.</span>
          }
        </div>

        <div class="field">
          <label for="product-quantity">Initial stock</label>
          <input
            id="product-quantity"
            class="input"
            type="number"
            step="1"
            formControlName="availableQuantity"
            [class.invalid]="showError('availableQuantity')"
          />
          @if (showError('availableQuantity')) {
            <span class="error">Enter a whole number from 0 to 100,000,000.</span>
          }
        </div>
      </div>

      <div class="field">
        <label for="product-picture">Picture <span class="optional">(optional)</span></label>
        <input
          #picker
          id="product-picture"
          class="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          (change)="choose(picker)"
        />
        @if (pictureError(); as message) {
          <span class="error">{{ message }}</span>
        } @else {
          <span class="hint">JPEG, PNG or WebP, up to {{ maxMegabytes }} MB. You can add one later too.</span>
        }
      </div>

      <div class="actions">
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Creating…' : 'Create product' }}
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
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .optional,
    .hint {
      color: var(--text-muted);
      font-weight: 400;
    }
    .hint {
      font-size: 0.85rem;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class ProductForm {
  private readonly api = inject(ProductsApi);

  readonly saved = output<Product>();

  protected readonly maxMegabytes = MAX_IMAGE_BYTES / 1024 / 1024;
  protected readonly saving = signal(false);
  protected readonly pictureError = signal<string | null>(null);
  private readonly submitted = signal(false);
  private picture: File | null = null;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, notBlank, Validators.maxLength(200)]],
    price: [0, [Validators.required, Validators.min(0.01), Validators.max(1_000_000)]],
    availableQuantity: [0, [Validators.required, Validators.min(0), Validators.max(100_000_000), integer]],
  });

  protected showError(name: 'name' | 'price' | 'availableQuantity'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected choose(picker: HTMLInputElement): void {
    const file = picker.files?.[0] ?? null;
    const problem = file ? validateImage(file) : null;

    this.pictureError.set(problem);
    this.picture = problem ? null : file;
    if (problem) picker.value = '';
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.saving()) return;

    const picture = this.picture;
    this.saving.set(true);

    this.api
      .create(this.form.getRawValue())
      .pipe(
        // The product exists once it is created. If only the picture fails, the person is told by the
        // global error message and can add the picture from the Edit dialog.
        switchMap((product) =>
          picture ? this.api.uploadImage(product.id, picture).pipe(catchError(() => of(product))) : of(product),
        ),
      )
      .subscribe({
        next: (product) => {
          this.saving.set(false);
          this.saved.emit(product);
        },
        error: () => this.saving.set(false),
      });
  }
}
