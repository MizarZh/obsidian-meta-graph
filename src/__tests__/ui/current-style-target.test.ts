import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import { describe, expect, it } from 'vitest';
import type {
	KnowledgeNode,
	KnowledgeEdge,
	NodeStyleRule,
	LinkStyleRule,
} from '@/core/types';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import {
	currentNodeStyleTarget,
	currentLinkStyleTarget,
} from '@/ui/workspace/current-style-target';

const node: KnowledgeNode = {
	id: 'a',
	path: 'a.md',
	title: 'A',
	folder: '',
	tags: [],
	domains: [],
};
const edge: KnowledgeEdge = {
	id: 'ab',
	source: 'a',
	target: 'b',
	relation: 'related',
	directed: false,
	sourcePath: 'a.md',
	sourceField: 'related',
};
const nodeRule = (id: string): NodeStyleRule => ({
	id,
	field: 'all',
	value: '',
	color: '#123',
	size: 8,
});
const linkRule = (id: string): LinkStyleRule => ({
	id,
	field: 'all',
	value: '',
	color: '#123',
	size: 1,
	lineStyle: 'solid',
	label: '',
	showLabel: false,
	hidden: false,
});

describe('current style editor targets', () => {
	it('uses last matching chart rule before global rules, with real conditions', () => {
		const state = createWorkspaceState(200);
		state.globalNodeStyleRules = [nodeRule('global')];
		getActiveChartStyle(state).nodeRules = [
			nodeRule('first'),
			nodeRule('last'),
			{ ...nodeRule('miss'), field: 'tag', value: 'absent' },
		];
		expect(currentNodeStyleTarget(state, node)).toBe('current:last');
		getActiveChartStyle(state).nodeRules = [];
		expect(currentNodeStyleTarget(state, node)).toBe('global:global');
		state.globalLinkStyleRules = [linkRule('global')];
		getActiveChartStyle(state).linkRules = [
			linkRule('last'),
			{ ...linkRule('miss'), field: 'relation', value: 'absent' },
		];
		expect(currentLinkStyleTarget(state, edge)).toBe('current:last');
		getActiveChartStyle(state).linkRules = [];
		expect(currentLinkStyleTarget(state, edge)).toBe('global:global');
	});
	it('falls back to the correct base settings without creating a rule', () => {
		const state = createWorkspaceState(200);
		getActiveChartStyle(state).nodeRules = [];
		state.globalNodeStyleRules = [];
		getActiveChartStyle(state).linkRules = [];
		state.globalLinkStyleRules = [];
		getActiveChartStyle(state).nodeOverrides = {};
		getActiveChartStyle(state).linkOverrides = {};
		expect(currentNodeStyleTarget(state, node)).toBe('workspace-default');
		expect(currentLinkStyleTarget(state, edge)).toBe('workspace-default');
		getActiveChartStyle(state).nodeOverrides = { size: 9 };
		getActiveChartStyle(state).linkOverrides = { size: 2 };
		expect(currentNodeStyleTarget(state, node)).toBe('Chart overrides');
		expect(currentLinkStyleTarget(state, edge)).toBe('Chart overrides');
	});
	it('bypasses ordinary rules for unresolved nodes and special links', () => {
		const state = createWorkspaceState(200);
		getActiveChartStyle(state).nodeRules = [nodeRule('all')];
		getActiveChartStyle(state).linkRules = [linkRule('all')];
		expect(
			currentNodeStyleTarget(state, { ...node, kind: 'unresolved' }),
		).toBe('Unresolved nodes');
		expect(
			currentLinkStyleTarget(state, { ...edge, kind: 'plain-link' }),
		).toBe('Plain links');
		expect(
			currentLinkStyleTarget(state, { ...edge, kind: 'unresolved-link' }),
		).toBe('Unresolved links');
	});
});
