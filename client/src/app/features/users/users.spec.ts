import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { seedSession } from '../../../testing/seed-session';
import { UsersApi } from '../../core/api/users.api';
import { UserListItem } from '../../core/models/api.models';
import { Users } from './users';

const people: UserListItem[] = [
  { id: 1, email: 'admin@example.com', displayName: 'Test Admin', role: 'Admin', createdAt: '2026-01-05T10:00:00Z', orderCount: 0 },
  { id: 5, email: 'layla@example.com', displayName: 'Layla Hassan', role: 'User', createdAt: '2026-02-10T10:00:00Z', orderCount: 12 },
  { id: 6, email: 'omar@example.com', displayName: 'Omar Khaled', role: 'Admin', createdAt: '2026-03-15T10:00:00Z', orderCount: 3 },
];

describe('Users page', () => {
  const api = {
    list: vi.fn(() => of({ items: people, page: 1, pageSize: 10, totalCount: 3, totalPages: 1 })),
    setRole: vi.fn((id: number, role: 'Admin' | 'User') => of({ ...people.find((p) => p.id === id)!, role })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom does not implement the modal parts of <dialog>.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });

    localStorage.clear();
    seedSession('Admin'); // id 1, the first row below
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: UsersApi, useValue: api }],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(Users);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const row = (name: string) => Array.from(element.querySelectorAll('tbody tr')).find((r) => r.textContent?.includes(name))!;
    const button = (scope: ParentNode, text: string) =>
      Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;
    return { fixture, element, row, button };
  }

  it('lists every user with their role and order count', async () => {
    const { row } = await render();

    expect(row('Layla Hassan').textContent).toContain('layla@example.com');
    expect(row('Layla Hassan').querySelector('.role')?.textContent?.trim()).toBe('User');
    expect(row('Layla Hassan').textContent).toContain('12');
    expect(row('Omar Khaled').querySelector('.role')?.textContent?.trim()).toBe('Admin');
  });

  it('does not let admins change their own role', async () => {
    const { row } = await render();

    const own = row('Test Admin');
    expect(own.textContent).toContain('you');
    expect(own.querySelector('button')).toBeNull();
    expect(own.textContent).toContain('Your own role cannot be changed');
  });

  it('asks for confirmation before promoting someone, then saves and reloads', async () => {
    const { fixture, element, row, button } = await render();

    button(row('Layla Hassan'), 'Make admin').click();
    await fixture.whenStable();
    expect(api.setRole).not.toHaveBeenCalled();
    expect(element.querySelector('dialog')?.textContent).toContain('Layla Hassan will be able to manage');

    button(element.querySelector('dialog .confirm-actions')!, 'Make admin').click();
    await fixture.whenStable();

    expect(api.setRole).toHaveBeenCalledWith(5, 'Admin');
    expect(element.querySelector('dialog')).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('offers to take admin access away from another admin', async () => {
    const { fixture, element, row, button } = await render();

    button(row('Omar Khaled'), 'Make regular user').click();
    await fixture.whenStable();
    button(element.querySelector('dialog .confirm-actions')!, 'Remove admin access').click();
    await fixture.whenStable();

    expect(api.setRole).toHaveBeenCalledWith(6, 'User');
  });

  it('leaves everything unchanged when the confirmation is cancelled', async () => {
    const { fixture, element, row, button } = await render();

    button(row('Layla Hassan'), 'Make admin').click();
    await fixture.whenStable();
    button(element.querySelector('dialog .confirm-actions')!, 'Cancel').click();
    await fixture.whenStable();

    expect(api.setRole).not.toHaveBeenCalled();
    expect(element.querySelector('dialog')).toBeNull();
  });
});
