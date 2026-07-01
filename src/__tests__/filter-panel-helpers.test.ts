import { describe, expect, it } from 'vitest';
import type { NodeFilterGroup } from '../core/types';
import {
	addFilterConditionToGroup,
	addFilterGroupToGroup,
	patchFilterItem,
	removeFilterItemFromGroup,
	shouldShowFilterValue,
} from '../ui/filter/filter-tree';
import {
	canMoveRule,
	createLinkStyleRule,
	createNodeStyleRule,
	moveRule,
	removeRule,
} from '../ui/filter/filter-style-rules';

describe('filter panel helpers', () => {
	it('updates nested filter tree items without mutating the original root', () => {
		const root: NodeFilterGroup = {
			id: 'root',
			kind: 'group',
			mode: 'all',
			children: [
				{
					id: 'child-group',
					kind: 'group',
					mode: 'any',
					children: [],
				},
			],
		};

		const withCondition = addFilterConditionToGroup(
			root,
			'child-group',
			'condition',
		);
		const patched = patchFilterItem(withCondition, 'condition', {
			value: 'target',
		}) as NodeFilterGroup;
		const removed = removeFilterItemFromGroup(patched, 'condition');

		expect(root.children[0]).toMatchObject({ children: [] });
		expect(patched.children[0]).toMatchObject({
			children: [{ id: 'condition', value: 'target' }],
		});
		expect(removed.children[0]).toMatchObject({ children: [] });
	});

	it('adds nested filter groups and hides empty-value inputs for unary operators', () => {
		const root: NodeFilterGroup = {
			id: 'root',
			kind: 'group',
			mode: 'all',
			children: [],
		};

		expect(addFilterGroupToGroup(root, 'root', 'group').children).toEqual([
			{ id: 'group', kind: 'group', mode: 'all', children: [] },
		]);
		expect(shouldShowFilterValue('has-value')).toBe(false);
		expect(shouldShowFilterValue('contains')).toBe(true);
	});

	it('creates, moves, and removes style rules', () => {
		const nodeRules = [
			createNodeStyleRule('first'),
			createNodeStyleRule('second'),
		];
		const moved = moveRule(nodeRules, 'second', -1);
		const linkRule = createLinkStyleRule('link');

		expect(canMoveRule(nodeRules, 'first', -1)).toBe(false);
		expect(moved.map((rule) => rule.id)).toEqual(['second', 'first']);
		expect(removeRule(moved, 'first').map((rule) => rule.id)).toEqual([
			'second',
		]);
		expect(linkRule).toMatchObject({
			field: 'source-field',
			operator: 'is',
			value: '',
			lineStyle: 'solid',
			showLabel: false,
		});
	});
});
