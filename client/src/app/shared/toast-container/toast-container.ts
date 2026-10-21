import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="'toast ' + toast.kind">
          <span>{{ toast.message }}</span>
          <button type="button" aria-label="Dismiss" (click)="toasts.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: min(26rem, calc(100vw - 2rem));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.7rem 0.9rem;
      border-radius: 10px;
      border: 1px solid var(--border);
      border-left-width: 4px;
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow-lg);
    }
    .toast.success {
      border-left-color: #22a05a;
    }
    .toast.error {
      border-left-color: var(--danger);
    }
    .toast.info {
      border-left-color: var(--primary);
    }
    button {
      border: none;
      background: none;
      color: var(--text-muted);
      font-size: 1.2rem;
      line-height: 1;
      cursor: pointer;
    }
  `,
})
export class ToastContainer {
  protected readonly toasts = inject(ToastService);
}
