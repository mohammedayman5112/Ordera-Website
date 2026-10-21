import { AuthResponse, User, UserRole } from '../app/core/models/api.models';

// Stores a signed-in session the way AuthService does, so a test can start as an admin or a regular user.
export function seedSession(role: UserRole, expiresInMs = 60 * 60 * 1000): User {
  const user: User = {
    id: role === 'Admin' ? 1 : 2,
    email: `${role.toLowerCase()}@example.com`,
    displayName: `Test ${role}`,
    role,
  };
  const session: AuthResponse = {
    accessToken: 'test-token',
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    user,
  };
  localStorage.setItem('ordera.session', JSON.stringify(session));
  return user;
}
