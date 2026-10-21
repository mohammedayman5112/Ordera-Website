import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (totalCount() > 0) {
      <nav class="pagination" aria-label="Pagination">
        <span class="muted">Showing {{ from() }}–{{ to() }} of {{ totalCount() }}</span>
        <span class="controls">
          <button type="button" class="btn btn-sm" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">
            Previous
          </button>
          <span class="current">Page {{ page() }} of {{ totalPages() }}</span>
          <button
            type="button"
            class="btn btn-sm"
            [disabled]="page() >= totalPages()"
            (click)="pageChange.emit(page() + 1)"
          >
            Next
          </button>
        </span>
      </nav>
    }
  `,
  styles: `
    .pagination {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem 1rem;
      padding: 0.75rem 1.1rem;
      border-top: 1px solid var(--border);
      font-size: 0.9rem;
    }
    .controls {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
    }
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));
  protected readonly from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly to = computed(() => Math.min(this.page() * this.pageSize(), this.totalCount()));
}
