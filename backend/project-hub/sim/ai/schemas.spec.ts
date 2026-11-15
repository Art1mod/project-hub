import { toApiSchema, UserPlanSchema, WorldSchema } from './schemas';

type Node = Record<string, unknown>;
function walk(node: unknown, visit: (n: Node) => void) {
    if (Array.isArray(node)) return node.forEach((x) => walk(x, visit));
    if (node && typeof node === 'object') {
        visit(node as Node);
        Object.values(node).forEach((v) => walk(v, visit));
    }
}

describe.each([['WorldSchema', WorldSchema], ['UserPlanSchema', UserPlanSchema]] as const)('%s as API schema', (_, schema) => {
    const json = toApiSchema(schema);

    it('closes every object with additionalProperties: false', () => {
        const objects: Node[] = [];
        walk(json, (n) => {
            if (n.type === 'object') objects.push(n);
        });
        expect(objects.length).toBeGreaterThan(0);
        for (const o of objects) expect(o.additionalProperties).toBe(false);
    });

    it('uses no constraints the API rejects', () => {
        const banned = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'oneOf', '$schema'];
        walk(json, (n) => {
            for (const k of banned) expect(n).not.toHaveProperty(k);
        });
    });
});
