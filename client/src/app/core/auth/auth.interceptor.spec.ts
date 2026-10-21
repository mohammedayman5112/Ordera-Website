import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { seedSession } from '../../../testing/seed-session';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  function setup(signedInAs?: 'Admin' | 'User') {
    localStorage.clear();
    if (signedInAs) seedSession(signedInAs);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  afterEach(() => controller.verify());

  it('sends the access token with API calls', () => {
    setup('User');

    http.get('/api/products').subscribe();

    const request = controller.expectOne('/api/products');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({});
  });

  it('does not send a token with the sign-in and sign-up calls', () => {
    setup('User');

    http.post('/api/auth/login', {}).subscribe();
    http.post('/api/auth/register', {}).subscribe();

    for (const request of controller.match(() => true)) {
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
  });

  it('never leaks the token to another site', () => {
    setup('User');

    http.get('https://example.org/api/data').subscribe();

    const request = controller.expectOne('https://example.org/api/data');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('adds nothing when nobody is signed in', () => {
    setup();

    http.get('/api/products').subscribe();

    const request = controller.expectOne('/api/products');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('ends the session when the API answers 401', () => {
    setup('User');
    const auth = TestBed.inject(AuthService);

    http.get('/api/orders').subscribe({ error: () => undefined });
    controller.expectOne('/api/orders').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('keeps the session when the API answers 403', () => {
    setup('User');
    const auth = TestBed.inject(AuthService);

    http.get('/api/dashboard/summary').subscribe({ error: () => undefined });
    controller.expectOne('/api/dashboard/summary').flush({}, { status: 403, statusText: 'Forbidden' });

    expect(auth.user()).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
