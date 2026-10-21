import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Login } from './login';

describe('Login', () => {
  let http: HttpTestingController;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  async function render(returnUrl?: string) {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function type(element: HTMLElement, selector: string, value: string) {
    const input = element.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(fixture: Awaited<ReturnType<typeof render>>['fixture']) {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await fixture.whenStable();
  }

  const userResponse = {
    accessToken: 'jwt',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    user: { id: 2, email: 'user@example.com', displayName: 'User', role: 'User' },
  };

  afterEach(() => http.verify());

  it('shows validation messages and sends nothing when the form is empty', async () => {
    const { fixture, element } = await render();

    await submit(fixture);

    expect(Array.from(element.querySelectorAll('.error')).map((e) => e.textContent?.trim())).toEqual([
      'Enter a valid email address.',
      'Enter your password.',
    ]);
    http.expectNone('/api/auth/login');
  });

  it('signs in and opens the home page of the role', async () => {
    const { fixture, element } = await render();
    type(element, '#login-email', 'user@example.com');
    type(element, '#login-password', 'Passw0rd1');

    await submit(fixture);
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'user@example.com', password: 'Passw0rd1' });
    request.flush(userResponse);
    await fixture.whenStable();

    expect(navigateByUrl).toHaveBeenCalledWith('/products');
  });

  it('returns to the page the user was trying to open', async () => {
    const { fixture, element } = await render('/orders/5');
    type(element, '#login-email', 'user@example.com');
    type(element, '#login-password', 'Passw0rd1');

    await submit(fixture);
    http.expectOne('/api/auth/login').flush(userResponse);
    await fixture.whenStable();

    expect(navigateByUrl).toHaveBeenCalledWith('/orders/5');
  });

  it('ignores a return address that points to another site', async () => {
    const { fixture, element } = await render('https://evil.example/phish');
    type(element, '#login-email', 'user@example.com');
    type(element, '#login-password', 'Passw0rd1');

    await submit(fixture);
    http.expectOne('/api/auth/login').flush(userResponse);
    await fixture.whenStable();

    expect(navigateByUrl).toHaveBeenCalledWith('/products');
  });

  it('shows the server message when the credentials are wrong', async () => {
    const { fixture, element } = await render();
    type(element, '#login-email', 'user@example.com');
    type(element, '#login-password', 'wrong-password');

    await submit(fixture);
    http
      .expectOne('/api/auth/login')
      .flush({ title: 'Sign-in failed', detail: 'Invalid email or password.' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(element.querySelector('.alert-error')?.textContent).toContain('Invalid email or password.');
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(element.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
  });

  it('submits through the form element so the page never reloads', async () => {
    const { element } = await render();

    const event = new Event('submit', { cancelable: true });
    element.querySelector('form')!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
