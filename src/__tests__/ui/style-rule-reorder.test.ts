import { describe, expect, it } from 'vitest';
import { reorderRuleAtTarget } from '@/ui/filter/filter-style-rules';

describe('style rule drag ordering', () => {
	const rules = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
	it('inserts below a target and preserves rule identity', () => {
		const next = reorderRuleAtTarget(rules, 'a', 'c', true);
		expect(next.map((rule) => rule.id)).toEqual(['b', 'c', 'a', 'd']);
		expect(next[2]).toBe(rules[0]);
		expect(rules.map((rule) => rule.id)).toEqual(['a', 'b', 'c', 'd']);
	});
	it('inserts above a target', () => {
		expect(
			reorderRuleAtTarget(rules, 'd', 'b', false).map((rule) => rule.id),
		).toEqual(['a', 'd', 'b', 'c']);
	});
	it('ignores missing, foreign, self and unchanged drops', () => {
		expect(reorderRuleAtTarget(rules, 'foreign', 'b', false)).toBe(rules);
		expect(reorderRuleAtTarget(rules, 'a', 'missing', false)).toBe(rules);
		expect(reorderRuleAtTarget(rules, 'a', 'a', true)).toBe(rules);
		expect(reorderRuleAtTarget(rules, 'a', 'b', false)).toBe(rules);
	});
});
