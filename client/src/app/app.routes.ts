import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth/auth.guard';
import { APP_NAME } from './core/config/app-info';

// Every page is lazy-loaded so the initial bundle only contains the router and the auth code.
export const routes: Routes = [
  {
    path: 'login',
    title: `Sign in · ${APP_NAME}`,
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: `Create account · ${APP_NAME}`,
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register').then((m) => m.Register),
  },
  {
    // Signed-in area. canActivateChild re-checks the session on every navigation, so an expired token is noticed early.
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: `Dashboard · ${APP_NAME}`,
        canActivate: [adminGuard],
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'products',
        title: `Products · ${APP_NAME}`,
        loadComponent: () => import('./features/products/products').then((m) => m.Products),
      },
      {
        path: 'users',
        title: `Users · ${APP_NAME}`,
        canActivate: [adminGuard],
        loadComponent: () => import('./features/users/users').then((m) => m.Users),
      },
      {
        path: 'orders',
        children: [
          {
            path: '',
            title: `Orders · ${APP_NAME}`,
            loadComponent: () => import('./features/orders/orders').then((m) => m.Orders),
          },
          {
            path: 'new',
            title: `New order · ${APP_NAME}`,
            loadComponent: () => import('./features/orders/order-new').then((m) => m.OrderNew),
          },
          {
            path: ':id/invoice',
            title: `Invoice · ${APP_NAME}`,
            loadComponent: () => import('./features/orders/invoice').then((m) => m.Invoice),
          },
          {
            path: ':id',
            title: `Order · ${APP_NAME}`,
            loadComponent: () => import('./features/orders/order-detail').then((m) => m.OrderDetail),
          },
        ],
      },
      {
        path: '**',
        title: `Page not found · ${APP_NAME}`,
        loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
