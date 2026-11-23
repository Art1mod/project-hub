import { TelemetryService } from './telemetry.service';
import type { CreateTelemetryBatchDto } from './dto/create-telemetry-batch.dto';

// @nestjs/common 12 is ESM-only and this Jest setup runs CommonJS, so the real
// package cannot be loaded here. Only the framework pieces the service touches
// are replaced; the row-building logic under test is the real one.
jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  Logger: class {
    warn = jest.fn();
  },
  NotFoundException: class extends Error {},
}));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

const ORG = '7d267081-b937-4051-a496-338f8ffd262e';
const SESSION = '13cedc90-4f3a-47df-aa04-003b612fff5a';

function makeService(membership: { role: string } | null = { role: 'MEMBER' }) {
  const prisma = {
    membership: { findFirst: jest.fn().mockResolvedValue(membership) },
    navEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const service = new TelemetryService(prisma as never);
  return { service, prisma };
}

function batch(...events: Record<string, unknown>[]): CreateTelemetryBatchDto {
  return {
    orgId: ORG,
    sessionId: SESSION,
    variant: 'control',
    events: events.map((e) => ({ clientTs: new Date().toISOString(), ...e })),
  } as unknown as CreateTelemetryBatchDto;
}

// The rows handed to prisma.navEvent.createMany
function storedRows(prisma: ReturnType<typeof makeService>['prisma']) {
  return prisma.navEvent.createMany.mock.calls[0][0].data as Record<string, unknown>[];
}

describe('TelemetryService', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.TELEMETRY_SALT = 'x'.repeat(32);
    delete process.env.TELEMETRY_ORIGIN;
    delete process.env.TELEMETRY_ENABLED;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('stores trigger, position and detail', async () => {
    const { service, prisma } = makeService();

    await service.recordBatch('user-1', batch({
      type: 'route_change',
      toRoute: '/projects',
      trigger: 'sidebar',
      position: 2,
      detail: { hiddenMs: 900 },
    }));

    expect(storedRows(prisma)[0]).toMatchObject({
      type: 'route_change',
      trigger: 'sidebar',
      position: 2,
      detail: { hiddenMs: 900 },
    });
  });

  it('sets schemaVersion 2 and origin real by default', async () => {
    const { service, prisma } = makeService();

    await service.recordBatch('user-1', batch({ type: 'route_change', toRoute: '/projects' }));

    expect(storedRows(prisma)[0]).toMatchObject({ schemaVersion: 2, origin: 'real' });
  });

  it('uses TELEMETRY_ORIGIN when it is set to pilot', async () => {
    process.env.TELEMETRY_ORIGIN = 'pilot';
    const { service, prisma } = makeService();

    await service.recordBatch('user-1', batch({ type: 'route_change', toRoute: '/projects' }));

    expect(storedRows(prisma)[0]).toMatchObject({ origin: 'pilot' });
  });

  it('throws at construction when TELEMETRY_ORIGIN is invalid', () => {
    process.env.TELEMETRY_ORIGIN = 'staging';

    expect(() => makeService()).toThrow('TELEMETRY_ORIGIN');
  });

  it('drops unknown detail keys', async () => {
    const { service, prisma } = makeService();

    await service.recordBatch('user-1', batch({
      type: 'route_change',
      toRoute: '/projects',
      detail: { hiddenMs: 5, title: 'secret' },
    }));

    expect(storedRows(prisma)[0].detail).toEqual({ hiddenMs: 5 });
  });

  it('drops the event when a detail value is invalid and stores the rest', async () => {
    const { service, prisma } = makeService();

    await service.recordBatch('user-1', batch(
      { type: 'route_change', toRoute: '/projects', detail: { hiddenMs: -1 } },
      { type: 'route_change', toRoute: '/members' },
    ));

    const rows = storedRows(prisma);
    expect(rows).toHaveLength(1);
    expect(rows[0].toRoute).toBe('/members');
  });

  it('stores events from an old client with empty new fields', async () => {
    const { service, prisma } = makeService();

    await service.recordBatch('user-1', batch({
      type: 'route_change',
      fromRoute: '/dashboard',
      toRoute: '/projects',
      dwellMs: 1000,
    }));

    const row = storedRows(prisma)[0];
    expect(row).toMatchObject({ trigger: null, position: null, schemaVersion: 2 });
    expect(row.detail).toBeUndefined();
  });

  it('rejects a batch for an organization the user is not a member of', async () => {
    const { service, prisma } = makeService(null);

    await expect(
      service.recordBatch('user-1', batch({ type: 'route_change', toRoute: '/projects' })),
    ).rejects.toThrow('Organization not found or access denied');
    expect(prisma.navEvent.createMany).not.toHaveBeenCalled();
  });
});
