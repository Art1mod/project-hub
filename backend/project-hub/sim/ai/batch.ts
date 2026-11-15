import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-sonnet-5-5';
export const EFFORT = 'high' as const;

export interface BatchItem {
    customId: string;
    system: Anthropic.TextBlockParam[];
    user: Anthropic.TextBlockParam[];
    schema: Record<string, unknown>;
    maxTokens: number;
}

/** The token counts this run uses; Anthropic.Usage is assignable to it. */
export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
}

export type BatchFailure = 'errored' | 'expired' | 'canceled' | 'refusal' | 'max_tokens' | 'invalid_json';

export type BatchOutcome =
    | { customId: string; ok: true; json: unknown; usage: TokenUsage }
    | { customId: string; ok: false; reason: BatchFailure; usage?: TokenUsage };

export interface BatchClient {
    run(items: BatchItem[]): Promise<BatchOutcome[]>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AnthropicBatchClient implements BatchClient {
    constructor(
        private readonly client: Anthropic = new Anthropic(),
        private readonly opts: { pollMs: number; log: (msg: string) => void } = { pollMs: 30_000, log: console.log },
    ) {}

    static toRequest(item: BatchItem): Anthropic.Messages.BatchCreateParams.Request {
        return {
            custom_id: item.customId,
            params: {
                model: MODEL,
                max_tokens: item.maxTokens,
                system: item.system,
                messages: [{ role: 'user', content: item.user }],
                output_config: { effort: EFFORT, format: { type: 'json_schema', schema: item.schema } },
            },
        };
    }

    static toOutcome(r: Anthropic.Messages.MessageBatchIndividualResponse): BatchOutcome {
        const customId = r.custom_id;
        if (r.result.type !== 'succeeded') return { customId, ok: false, reason: r.result.type };
        const message = r.result.message;
        const usage: TokenUsage = message.usage;
        // Check the stop reason before reading content: a refusal or a cut-off response has no usable JSON.
        if (message.stop_reason === 'refusal') return { customId, ok: false, reason: 'refusal', usage };
        if (message.stop_reason === 'max_tokens') return { customId, ok: false, reason: 'max_tokens', usage };
        const text = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
        if (!text) return { customId, ok: false, reason: 'invalid_json', usage };
        try {
            return { customId, ok: true, json: JSON.parse(text.text), usage };
        } catch {
            return { customId, ok: false, reason: 'invalid_json', usage };
        }
    }

    async run(items: BatchItem[]): Promise<BatchOutcome[]> {
        if (items.length === 0) return [];
        const created = await this.client.messages.batches.create({ requests: items.map(AnthropicBatchClient.toRequest) });
        this.opts.log(`batch ${created.id}: ${items.length} request(s) submitted`);

        let batch = created;
        while (batch.processing_status !== 'ended') {
            await sleep(this.opts.pollMs);
            batch = await this.client.messages.batches.retrieve(created.id);
            const c = batch.request_counts;
            this.opts.log(`batch ${created.id}: ${batch.processing_status} (processing ${c.processing}, succeeded ${c.succeeded}, errored ${c.errored})`);
        }

        // Results arrive in any order: key them by custom_id, never by position.
        const byId = new Map<string, BatchOutcome>();
        for await (const r of await this.client.messages.batches.results(created.id)) {
            byId.set(r.custom_id, AnthropicBatchClient.toOutcome(r));
        }
        return items.map((i) => byId.get(i.customId) ?? { customId: i.customId, ok: false, reason: 'expired' });
    }
}
