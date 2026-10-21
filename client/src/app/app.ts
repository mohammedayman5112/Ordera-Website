import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainer } from './shared/toast-container/toast-container';

// The root only hosts the router and the toasts. Sign-in pages render directly in it,
// everything else renders inside the Shell layout (see app.routes.ts).
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastContainer],
  template: `
    <router-outlet />
    <app-toast-container />
  `,
})
export class App {}
