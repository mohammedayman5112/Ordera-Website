import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, map } from 'rxjs';

// Debounced search input. `value` is the externally owned text (for example from the URL); it is written
// back into the field unless the user is typing in it.
@Component({
  selector: 'app-search-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      #box
      class="input"
      type="search"
      autocomplete="off"
      [placeholder]="placeholder()"
      [attr.aria-label]="placeholder()"
      (input)="typed.next(box.value)"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class SearchBox {
  readonly value = input('');
  readonly placeholder = input('Search…');
  readonly search = output<string>();

  protected readonly typed = new Subject<string>();
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  constructor() {
    this.typed
      .pipe(
        debounceTime(300),
        map((text) => text.trim()),
        takeUntilDestroyed(),
      )
      .subscribe((text) => this.search.emit(text));

    effect(() => {
      const external = this.value();
      const field = this.box()?.nativeElement;
      if (field && document.activeElement !== field && field.value !== external) {
        field.value = external;
      }
    });
  }
}
