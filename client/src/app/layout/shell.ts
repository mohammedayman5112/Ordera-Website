import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { RealtimeService } from '../core/realtime/realtime.service';
import { CartService } from '../core/services/cart.service';
import { BrandLogo } from '../shared/brand-logo/brand-logo';

// Frame for every signed-in page: navigation (which depends on the role), the account block and the page outlet.
// It also owns the live connection: it opens when the shell appears (after sign-in) and closes when it goes away.
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandLogo],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly realtime = inject(RealtimeService);

  constructor() {
    void this.realtime.start();
    inject(DestroyRef).onDestroy(() => this.realtime.stop());
  }
}
