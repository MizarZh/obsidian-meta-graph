import { describe, expect, it } from 'vitest';
import {
	addConnectionFieldAndSelectInState,
	getActiveConnectionModeInState,
	getConnectionModeForFieldInState,
	setActiveConnectionFieldInState,
	updateConnectionFieldInState,
} from '../workspace/state/connection-fields';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace connection fields', () => {
	it('does not select metadata fields until they are added', () => {
		const state = createWorkspaceState(100);

		const result = setActiveConnectionFieldInState(state, 'supports');

		expect(result.runQuery).toBe(false);
		expect(result.state).toBe(state);
		expect(result.state.connectionFieldSpecs).not.toContainEqual(
			expect.objectContaining({ field: 'supports' }),
		);
	});

	it('selects an added curated connection field without changing relations', () => {
		const initialState = {
			...createWorkspaceState(100),
			chartSource: 'curated' as const,
			charts: createWorkspaceState(100).charts.map((chart, index) =>
				index === 0 ? { ...chart, source: 'curated' as const } : chart,
			),
		};
		const state = addConnectionFieldAndSelectInState(
			initialState,
			'supports',
			'directed',
		).state;

		const result = setActiveConnectionFieldInState(
			state,
			'supports',
			'directed',
		);

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

	it('selects an exact added connection direction', () => {
		const directedState = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'supports',
			'directed',
		).state;
		const state = addConnectionFieldAndSelectInState(
			directedState,
			'supports',
			'reverse',
		).state;

		const result = setActiveConnectionFieldInState(
			state,
			'supports',
			'directed',
		);

		expect(result.state.activeConnectionFieldSpecId).toBe(
			'supports:directed',
		);
		expect(result.state.connectionFieldSpecs).toHaveLength(
			state.connectionFieldSpecs.length,
		);
	});

	it('requires an add action for a missing connection direction', () => {
		const state = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'supports',
			'directed',
		).state;

		const selection = setActiveConnectionFieldInState(
			state,
			'supports',
			'reverse',
		);

		expect(selection.state).toBe(state);
		expect(
			state.connectionFieldSpecs.some(
				(spec) => spec.field === 'supports' && spec.mode === 'reverse',
			),
		).toBe(false);

		const added = addConnectionFieldAndSelectInState(
			state,
			'supports',
			'reverse',
		);
		expect(added.state.activeConnectionFieldSpecId).toBe(
			'supports:reverse',
		);
	});

	it('adds connection fields and selects the new field', () => {
		const result = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			' supports ',
			'directed',
		);

		expect(result.runQuery).toBe(false);
		expect(result.state.activeConnectionField).toBe('supports');
		expect(result.state.connectionFields).toContain('supports');
		expect(result.state.query.relations).not.toContain('supports');
	});

	it('keeps blank added connection fields stable', () => {
		const state = createWorkspaceState(100);

		expect(
			addConnectionFieldAndSelectInState(state, '   ', 'directed'),
		).toEqual({
			state,
			runQuery: false,
		});
	});

	it('edits a connection in place and keeps it active', () => {
		const state = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'supports',
			'directed',
		).state;

		const updated = updateConnectionFieldInState(
			state,
			'supports:directed',
			' supported-by ',
			'reverse',
		);

		expect(updated.activeConnectionField).toBe('supported-by');
		expect(updated.activeConnectionFieldSpecId).toBe(
			'supported-by:reverse',
		);
		expect(updated.connectionFieldSpecs).toContainEqual({
			id: 'supported-by:reverse',
			field: 'supported-by',
			mode: 'reverse',
		});
	});

	it('rejects an edit that duplicates another connection', () => {
		const directed = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'supports',
			'directed',
		).state;
		const state = addConnectionFieldAndSelectInState(
			directed,
			'supports',
			'reverse',
		).state;

		expect(
			updateConnectionFieldInState(
				state,
				'supports:reverse',
				'supports',
				'directed',
			),
		).toBe(state);
	});

	it('returns active connection mode from state', () => {
		const state = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'supports',
			'reverse',
		).state;

		expect(getActiveConnectionModeInState(state)).toBe('reverse');
	});

	it('uses default mode for inactive connection fields', () => {
		const state = addConnectionFieldAndSelectInState(
			createWorkspaceState(100),
			'supports',
			'reverse',
		).state;

		expect(getConnectionModeForFieldInState(state, 'supports')).toBe(
			'reverse',
		);
		expect(getConnectionModeForFieldInState(state, 'blocks')).toBe(
			'directed',
		);
	});
});
