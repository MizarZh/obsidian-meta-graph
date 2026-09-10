import { describe, expect, it } from 'vitest';
import {
	styleRuleCaption,
	styleRuleCondition,
} from '@/ui/filter/style-rule-caption';
import {
	normalizeGlobalNodeStyleRules,
	normalizeGlobalLinkStyleRules,
} from '@/workspace/meta-graph/style';

describe('style rule captions', () => {
	it('keeps the matching operator in automatic names', () => {
		expect(styleRuleCondition('Source field', 'is', 'related')).toBe(
			'Source field is related',
		);
		expect(styleRuleCondition('Tag', 'does-not-contain', '#finance')).toBe(
			'Tag does not contain #finance',
		);
		expect(styleRuleCondition('Folder', 'is empty', 'stale')).toBe(
			'Folder is empty',
		);
	});
	it('keeps conditions visible with a custom name and restores automatic names when cleared', () => {
		expect(
			styleRuleCaption(' Emphasis ', 'Relation is related', '2px'),
		).toEqual({ title: 'Emphasis', summary: 'Relation is related · 2px' });
		expect(styleRuleCaption(' ', 'Relation is related', '2px')).toEqual({
			title: 'Relation is related',
			summary: '2px',
		});
	});
	it('preserves valid names and removes invalid names during normalization', () => {
		for (const normalize of [
			normalizeGlobalNodeStyleRules,
			normalizeGlobalLinkStyleRules,
		]) {
			const rules = normalize([
				{ id: 'a', field: 'source-field', name: ' Named ' },
				{ id: 'b', field: 'source-field', name: 123 },
				{ id: 'c', field: 'source-field' },
			]);
			expect(rules.map((rule) => rule.name)).toEqual([
				'Named',
				undefined,
				undefined,
			]);
		}
	});
});
