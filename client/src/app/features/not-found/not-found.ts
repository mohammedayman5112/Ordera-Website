import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="card">
      <div class="empty">
        <strong>Page not found</strong>
        The page you are looking for does not exist.
        <p><a class="btn btn-primary" routerLink="/">Back to dashboard</a></p>
      </div>
    </section>
  `,
})
export class NotFound {}
