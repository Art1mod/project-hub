import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTelemetryBatchDto } from './create-telemetry-batch.dto';
import { TELEMETRY_TRIGGERS } from '../telemetry-vocabulary';

const NEW_ACTIONS = [
  'org_create',
  'org_update',
  'org_delete',
  'org_switch',
  'sort_change',
  'project_filter_change',
  'attention_modal_open',
  'attention_modal_close',
  'attention_modal_page',
];

async function isValid(event: Record<string, unknown>) {
  const batch = plainToInstance(CreateTelemetryBatchDto, {
    orgId: '7d267081-b937-4051-a496-338f8ffd262e',
    sessionId: '13cedc90-4f3a-47df-aa04-003b612fff5a',
    variant: 'control',
    events: [{ type: 'link_hover', clientTs: new Date().toISOString(), ...event }],
  });
  return (await validate(batch)).length === 0;
}

describe('CreateTelemetryBatchDto', () => {
  it.each(NEW_ACTIONS)('accepts the new action %s', async (action) => {
    expect(await isValid({ type: 'action', action })).toBe(true);
  });

  it.each([...TELEMETRY_TRIGGERS])('accepts the trigger %s', async (trigger) => {
    expect(await isValid({ trigger })).toBe(true);
  });

  it('rejects an unknown trigger', async () => {
    expect(await isValid({ trigger: 'mouse' })).toBe(false);
  });

  it('accepts position 1 and 100 and rejects 0 and 101', async () => {
    expect(await isValid({ position: 1 })).toBe(true);
    expect(await isValid({ position: 100 })).toBe(true);
    expect(await isValid({ position: 0 })).toBe(false);
    expect(await isValid({ position: 101 })).toBe(false);
  });

  it('accepts detail that is an object', async () => {
    expect(await isValid({ detail: { hiddenMs: 10 } })).toBe(true);
  });

  it.each([['text'], [5], [[1, 2]]])('rejects detail that is not an object: %p', async (detail) => {
    expect(await isValid({ detail })).toBe(false);
  });

  it('still accepts an event with none of the new fields', async () => {
    expect(await isValid({})).toBe(true);
  });
});
