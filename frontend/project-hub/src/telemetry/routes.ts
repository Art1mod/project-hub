const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// must match App.tsx and the backend route-normalizer
const STATIC_ROUTES = new Set([
    '/dashboard',
    '/projects',
    '/members',
    '/invitations',
    '/settings',
    '/profile',
]);

/** Returns a route pattern, or null for pages that must not be tracked (login, unknown). */
export function toRoutePattern(path: string): string | null {
    const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    if (STATIC_ROUTES.has(clean)) return clean;

    const match = clean.match(/^\/projects\/([^/]+)$/);
    if (match && UUID.test(match[1])) return '/projects/:id';

    return null;
}