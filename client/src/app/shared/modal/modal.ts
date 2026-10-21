import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';

// Thin wrapper around the native <dialog> element, which provides focus trapping, Esc handling and a backdrop.
// The parent renders it with @if and removes it again when `closed` fires.
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      [attr.aria-label]="title()"
      (close)="closed.emit()"
      (click)="closeOnBackdropClick($event)"
    >
      <div class="modal">
        <header>
          <h2>{{ title() }}</h2>
          <button type="button" class="close" aria-label="Close" (click)="dialog.close()">×</button>
        </header>
        <div class="body"><ng-content /></div>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(30rem, calc(100vw - 2rem));
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow-lg);
    }
    dialog::backdrop {
      background: rgb(10 14 28 / 55%);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.9rem 1.2rem;
      border-bottom: 1px solid var(--border);
    }
    .close {
      border: none;
      background: none;
      color: var(--text-muted);
      font-size: 1.6rem;
      line-height: 1;
      cursor: pointer;
    }
    .body {
      padding: 1.2rem;
    }
  `,
})
export class Modal {
  readonly title = input.required<string>();
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  // Clicks on the backdrop target the <dialog> itself; clicks on its content do not.
  // This must return void: a template handler that returns false makes Angular call preventDefault(),
  // which would stop submit buttons inside the dialog from submitting their form.
  protected closeOnBackdropClick(event: MouseEvent): void {
    const dialog = this.dialog().nativeElement;
    if (event.target === dialog) dialog.close();
  }
}
