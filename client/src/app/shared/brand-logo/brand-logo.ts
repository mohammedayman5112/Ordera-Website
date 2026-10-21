import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { APP_NAME } from '../../core/config/app-info';

// The logo mark and the product name. The mark follows the primary colour of the current theme.
@Component({
  selector: 'app-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <g transform="translate(4 4)" fill="none" stroke="var(--primary-contrast)" stroke-width="1.7" stroke-linejoin="round">
        <path d="M12 2.8 20 7v10l-8 4.2L4 17V7zM4.3 7.2 12 11.4l7.7-4.2M12 11.4v9.6" />
      </g>
    </svg>
    @if (showName()) {
      <span class="name">{{ name }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--primary);
    }
    .name {
      color: var(--text);
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
  `,
})
export class BrandLogo {
  readonly size = input(28);
  readonly showName = input(true);
  protected readonly name = APP_NAME;
}
