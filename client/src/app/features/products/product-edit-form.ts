import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductsApi } from '../../core/api/products.api';
import { Product } from '../../core/models/api.models';
import { MAX_IMAGE_BYTES, validateImage } from '../../core/utils/images';
import { notBlank } from '../../core/utils/validators';
import { ProductImage } from '../../shared/product-image/product-image';

// Edits a product: its picture (uploaded straight away), and its name and price (saved with the button).
// Stock has its own dialog; past orders keep their price.
@Component({
  selector: 'app-product-edit-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductImage, ReactiveFormsModule],
  template: `
    <div class="picture">
      <app-product-image [src]="imageUrl()" [name]="product().name" [size]="96" />
      <div class="picture-actions">
        <input
          #picker
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          (change)="choose(picker)"
        />
        <div class="buttons">
          <button type="button" class="btn btn-sm" [disabled]="uploading()" (click)="picker.click()">
            {{ uploading() ? 'Uploading…' : imageUrl() ? 'Change picture' : 'Upload picture' }}
          </button>
          @if (imageUrl()) {
            <button type="button" class="btn btn-sm" [disabled]="uploading()" (click)="remove()">Remove</button>
          }
        </div>
        @if (imageError(); as message) {
          <span class="error">{{ message }}</span>
        } @else {
          <span class="hint">JPEG, PNG or WebP, up to {{ maxMegabytes }} MB.</span>
        }
      </div>
    </div>

    <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="edit-name">Name</label>
        <input
          id="edit-name"
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

      <div class="field">
        <label for="edit-price">Price (USD)</label>
        <input
          id="edit-price"
          class="input"
          type="number"
          step="0.01"
          formControlName="price"
          [class.invalid]="showError('price')"
        />
        @if (showError('price')) {
          <span class="error">Enter a price between 0.01 and 1,000,000.</span>
        } @else {
          <span class="hint">Orders that were already placed keep the price they were bought at.</span>
        }
      </div>

      <div class="actions">
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .picture {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--border);
    }
    .picture-actions {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      min-width: 0;
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .hint,
    .error {
      font-size: 0.85rem;
    }
    .hint {
      color: var(--text-muted);
    }
    .error {
      color: var(--danger);
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class ProductEditForm {
  private readonly api = inject(ProductsApi);

  readonly product = input.required<Product>();
  readonly saved = output<Product>();
  // The picture is saved as soon as it is chosen, so the list behind the dialog can refresh right away.
  readonly imageChanged = output<Product>();

  protected readonly maxMegabytes = MAX_IMAGE_BYTES / 1024 / 1024;
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly imageError = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, notBlank, Validators.maxLength(200)]],
    price: [0, [Validators.required, Validators.min(0.01), Validators.max(1_000_000)]],
  });

  constructor() {
    // Fill the form and the picture from the product input once it is available.
    effect(() => {
      const { name, price, imageUrl } = this.product();
      untracked(() => {
        this.form.reset({ name, price });
        this.imageUrl.set(imageUrl);
      });
    });
  }

  protected showError(name: 'name' | 'price'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected choose(picker: HTMLInputElement): void {
    const file = picker.files?.[0];
    picker.value = ''; // lets the same file be chosen again later
    if (!file) return;

    const problem = validateImage(file);
    this.imageError.set(problem);
    if (problem) return;

    this.uploading.set(true);
    this.api.uploadImage(this.product().id, file).subscribe({
      next: (product) => this.imageDone(product),
      error: () => this.uploading.set(false),
    });
  }

  protected remove(): void {
    this.imageError.set(null);
    this.uploading.set(true);
    this.api.removeImage(this.product().id).subscribe({
      next: (product) => this.imageDone(product),
      error: () => this.uploading.set(false),
    });
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    this.api.update(this.product().id, this.form.getRawValue()).subscribe({
      next: (product) => {
        this.saving.set(false);
        this.saved.emit(product);
      },
      error: () => this.saving.set(false),
    });
  }

  private imageDone(product: Product): void {
    this.uploading.set(false);
    this.imageUrl.set(product.imageUrl);
    this.imageChanged.emit(product);
  }
}
