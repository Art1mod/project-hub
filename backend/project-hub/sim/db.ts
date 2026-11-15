import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** host:port/database, with loopback spellings collapsed, so two URLs can be compared. */
function databaseIdentity(url: string): string {
    const u = new URL(url);
    const host = LOOPBACK.has(u.hostname.toLowerCase()) ? 'loopback' : u.hostname.toLowerCase();
    const port = u.port || '5432';
    const db = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return `${host}:${port}/${db}`;
}

/** Throws unless simUrl is set and points at a different database than the backend's main one. */
export function assertSimDatabase(simUrl: string | undefined, mainUrl: string | undefined): void {
    if (!simUrl) {
        throw new Error('SIM_DATABASE_URL is not set; the simulator only writes to a separate sim database');
    }
    if (mainUrl && databaseIdentity(simUrl) === databaseIdentity(mainUrl)) {
        throw new Error('SIM_DATABASE_URL points at the main DATABASE_URL database; refusing to write simulated data there');
    }
}

export function createSimPrisma(): PrismaClient {
    const simUrl = process.env.SIM_DATABASE_URL;
    assertSimDatabase(simUrl, process.env.DATABASE_URL);
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: simUrl }) });
}
