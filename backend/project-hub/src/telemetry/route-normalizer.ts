const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

const STATIC_ROUTES = new Set([
    '/dashboard',
    '/projects',
    '/members',
    '/invitations',
    '/settings',
    '/profile',
]);

const PROJECT_DETAIL = new RegExp(`^/projects/(?:${UUID}|:id)$`);

export function normalizeRoute(input: string): string | null {
    // Drop query string and hash, then any trailing slash
    const path = input.split(/[?#]/)[0].replace(/\/+$/, '') || '/';

    if (STATIC_ROUTES.has(path)) return path;
    if (PROJECT_DETAIL.test(path)) return '/projects/:id';
    return null;
}