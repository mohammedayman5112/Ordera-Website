import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

// Shows a product picture. Without a picture (or if it fails to load) it shows a coloured tile with the
// product's initial instead, so lists never have gaps. Give it a `size` for a square thumbnail; without
// one it fills the width of its container at a 4:3 ratio, which suits product cards.
@Component({
  selector: 'app-product-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.thumb]': 'size() !== null',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    @if (showPicture()) {
      <img [src]="src()" [alt]="name()" loading="lazy" decoding="async" (error)="failedUrl.set(src())" />
    } @else {
      <span class="tile" aria-hidden="true" [style.background]="background()" [style.color]="foreground()">{{ initial() }}</span>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      overflow: hidden;
      border-radius: 10px;
      background: var(--surface-2);
    }
    :host(.thumb) {
      flex: none;
      aspect-ratio: auto;
      border-radius: 8px;
    }
    img,
    .tile {
      display: block;
      width: 100%;
      height: 100%;
    }
    img {
      object-fit: cover;
    }
    .tile {
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 1.4em;
    }
    :host(.thumb) .tile {
      font-size: 1rem;
    }
  `,
})
export class ProductImage {
  readonly src = input<string | null | undefined>(null);
  readonly name = input.required<string>();
  readonly size = input<number | null>(null);

  // The address that failed to load, so a new picture gets a fresh chance.
  protected readonly failedUrl = signal<string | null | undefined>(null);
  protected readonly showPicture = computed(() => !!this.src() && this.failedUrl() !== this.src());

  protected readonly initial = computed(() => this.name().trim().charAt(0).toUpperCase() || '?');

  // The tile colour comes from the name, so a product keeps the same colour everywhere.
  private readonly hue = computed(() => [...this.name()].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 360, 7));
  protected readonly background = computed(() => `hsl(${this.hue()} 70% 90%)`);
  protected readonly foreground = computed(() => `hsl(${this.hue()} 45% 32%)`);
}
