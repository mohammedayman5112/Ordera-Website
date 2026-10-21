import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { OrderStatus } from '../../core/models/api.models';
import { statusClass } from '../../core/utils/status';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="statusClass()">{{ status() }}</span>`,
  styles: `
    .badge {
      display: inline-block;
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      background: var(--st-bg);
      color: var(--st-fg);
      font-size: 0.8rem;
      font-weight: 600;
      line-height: 1.5;
    }
  `,
})
export class StatusBadge {
  readonly status = input.required<OrderStatus>();
  protected readonly statusClass = computed(() => `badge ${statusClass(this.status())}`);
}
