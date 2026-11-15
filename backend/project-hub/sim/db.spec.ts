import { assertSimDatabase } from './db';

describe('assertSimDatabase', () => {
    const MAIN = 'postgresql://postgres:password@localhost:5432/taskforge';

    it('refuses when SIM_DATABASE_URL is unset', () => {
        expect(() => assertSimDatabase(undefined, MAIN)).toThrow(/SIM_DATABASE_URL/);
        expect(() => assertSimDatabase('', MAIN)).toThrow(/SIM_DATABASE_URL/);
    });

    it('refuses the main database even when spelled differently', () => {
        expect(() => assertSimDatabase(MAIN, MAIN)).toThrow(/SIM_DATABASE_URL/);
        expect(() =>
            assertSimDatabase('postgresql://a:b@127.0.0.1/taskforge?schema=public', MAIN),
        ).toThrow(/SIM_DATABASE_URL/);
        expect(() =>
            assertSimDatabase('postgres://x:y@[::1]:5432/taskforge', 'postgresql://p:q@localhost/taskforge?schema=public'),
        ).toThrow(/SIM_DATABASE_URL/);
    });

    it('accepts a different database on the same server', () => {
        expect(() =>
            assertSimDatabase('postgresql://postgres:password@localhost:5432/taskforge_sim', MAIN),
        ).not.toThrow();
    });

    it('accepts the same database name on a different port', () => {
        expect(() => assertSimDatabase('postgresql://u:p@localhost:5433/taskforge', MAIN)).not.toThrow();
    });
});
