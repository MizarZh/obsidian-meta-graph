import { describe, expect, it } from 'vitest';
import {
	setActiveConnectionFieldInState,
	setConnectionFieldModeInState,
} from '../workspace/workspace-connection-fields';
import { createWorkspaceState } from '../workspace/workspace-state';

describe('workspace connection fields', () => {
	it('adds selected query connection fields to active chart relations', () => {
		const state = createWorkspaceState(100);

		const result = setActiveConnectionFieldInState(state, 'supports');

		expect(result.runQuery).toBe(true);
		expect(result.state.activeConnectionField).toBe('supports');
		expect(result.state.query.relations).toContain('supports');
		expect(result.state.charts[0]?.query.relations).toContain('supports');
	});

	it('updates curated active connection field without changing query relations', () => {
		const state = {
			...createWorkspaceState(100),
			chartSource: 'curated' as const,
			charts: createWorkspaceState(100).charts.map((chart, index) =>
				index === 0 ? { ...chart, source: 'curated' as const } : chart,
			),
		};

		const result = setActiveConnectionFieldInState(state, 'supports');

		expect(result.runQuery).toBe(false);
		expect(result.state.activeConnectionField).toBe('supports');
		expect(result.state.query.relations).toEqual(state.query.relations);
	});

	it('keeps empty fields referentially stable', () => {
		const state = createWorkspaceState(100);

		expect(setActiveConnectionFieldInState(state, '   ')).toEqual({
			state,
			runQuery: false,
		});
	});

	it('uses the active connection mode when selecting a spec', () => {
		const state = setConnectionFieldModeInState(
			createWorkspaceState(100),
			'supports',
			'reverse',
		);

		const result = setActiveConnectionFieldInState(state, 'supports');

		expect(result.state.activeConnectionFieldSpecId).toBe('supports:reverse');
	});
});
