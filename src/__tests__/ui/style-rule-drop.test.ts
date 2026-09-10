import { describe, expect, it } from 'vitest';
import { planStyleRuleDrop } from '@/ui/filter/style-rule-drop';

describe('cross-scope style drops', () => {
	const global = [
		{ id: 'a', color: 'red' },
		{ id: 'b', color: 'blue' },
	];
	const current = [{ id: 'c', color: 'green' }];
	it('moves a global rule into an empty chart section without changing its identity', () => {
		const plan = planStyleRuleDrop(global, [], 'global:a', 'current')!;
		expect(plan.transferred).toBe(true);
		expect(plan.rules).toEqual([global[0]]);
		expect(plan.rules[0]).toBe(global[0]);
		expect(global).toHaveLength(2);
	});
	it.each([false, true])(
		'moves chart to global at the chosen side (after=%s)',
		(after) => {
			const plan = planStyleRuleDrop(
				global,
				current,
				'current:c',
				'global',
				'b',
				after,
			)!;
			expect(plan.rules.map((rule) => rule.id)).toEqual(
				after ? ['a', 'b', 'c'] : ['a', 'c', 'b'],
			);
		},
	);
	it('still supports in-section ordering', () => {
		const plan = planStyleRuleDrop(
			global,
			current,
			'global:a',
			'global',
			'b',
			true,
		)!;
		expect(plan.transferred).toBe(false);
		expect(plan.rules.map((rule) => rule.id)).toEqual(['b', 'a']);
	});
	it('rejects invalid payloads, missing targets and duplicate IDs', () => {
		expect(
			planStyleRuleDrop(global, current, 'foreign:a', 'current'),
		).toBeUndefined();
		expect(
			planStyleRuleDrop(global, current, 'global:missing', 'current'),
		).toBeUndefined();
		expect(
			planStyleRuleDrop(
				global,
				current,
				'global:a',
				'current',
				'missing',
			),
		).toBeUndefined();
		expect(
			planStyleRuleDrop(global, [global[0]!], 'global:a', 'current'),
		).toBeUndefined();
	});
});
