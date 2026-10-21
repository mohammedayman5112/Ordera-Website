import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { UsersApi } from '../../core/api/users.api';
import { AuthService } from '../../core/auth/auth.service';
import { PagedResult, UserListItem, UserRole } from '../../core/models/api.models';
import { ToastService } from '../../core/services/toast.service';
import { Modal } from '../../shared/modal/modal';
import { Pagination } from '../../shared/pagination/pagination';
import { SearchBox } from '../../shared/search-box/search-box';

const PAGE_SIZE = 10;

interface RoleChange {
  user: UserListItem;
  role: UserRole;
}

// Admin-only screen: see every account and promote or demote it.
// A role is stored in the access token, so a change applies the next time that person signs in.
@Component({
  selector: 'app-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, Modal, Pagination, SearchBox],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class Users {
  private readonly api = inject(UsersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? null);

  protected readonly query = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({
        page: Math.max(1, Number(params.get('page')) || 1),
        search: params.get('search') ?? '',
      })),
    ),
    { initialValue: { page: 1, search: '' } },
  );

  private readonly refreshTick = signal(0);

  protected readonly result = signal<PagedResult<UserListItem> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly pending = signal<RoleChange | null>(null);
  protected readonly saving = signal(false);

  protected readonly isEmpty = computed(() => this.result()?.items.length === 0);

  constructor() {
    toObservable(computed(() => ({ ...this.query(), tick: this.refreshTick() })))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(({ page, search }) =>
          this.api.list({ page, pageSize: PAGE_SIZE, search }).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) this.result.set(result);
        this.loading.set(false);
      });
  }

  protected refresh(): void {
    this.refreshTick.update((n) => n + 1);
  }

  protected onSearch(search: string): void {
    if (search !== this.query().search) this.navigate({ search, page: 1 });
  }

  protected goTo(page: number): void {
    this.navigate({ page });
  }

  protected askToChangeRole(user: UserListItem): void {
    this.pending.set({ user, role: user.role === 'Admin' ? 'User' : 'Admin' });
  }

  protected confirmRoleChange(): void {
    const change = this.pending();
    if (!change || this.saving()) return;

    this.saving.set(true);
    this.api.setRole(change.user.id, change.role).subscribe({
      next: (user) => {
        this.saving.set(false);
        this.pending.set(null);
        this.toast.success(`${user.displayName} is now ${user.role === 'Admin' ? 'an admin' : 'a regular user'}.`);
        this.refresh();
      },
      error: () => {
        this.saving.set(false);
        this.pending.set(null);
      },
    });
  }

  private navigate(change: { page?: number; search?: string }): void {
    const next = { ...this.query(), ...change };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: next.page > 1 ? next.page : null, search: next.search || null },
      queryParamsHandling: 'merge',
    });
  }
}
