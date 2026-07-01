import { describe, expect, it } from 'vitest';
import {
	addChartInState,
	deleteActiveChartInState,
	duplicateActiveChartAndSetSourceInState,
	duplicateActiveChartAndSetTypeInState,
	setActiveChartInState,
	setActiveChartNameInState,
	setActiveChartSourceInState,
	setActiveChartTypeInState,
} from '../workspace/state/chart-state';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace chart state', () => {
	it('switches active charts while preserving runtime-only state', () => {
		const state = {
			...createWorkspaceState(100),
			currentNoteId: 'current.md',
			connectionUndoCount: 2,
			availableFolders: ['folder'],
			layoutRevision: 4,
		};

		const result = setActiveChartInState(state, 'learning-flow');

		expect(result.runQuery).toBe(true);
		expect(result.state.activeChartId).toBe('learning-flow');
		expect(result.state.mode).toBe('flow');
		expect(result.state.currentNoteId).toBe('current.md');
		expect(result.state.connectionUndoCount).toBe(2);
		expect(result.state.availableFolders).toEqual(['folder']);
		expect(result.state.layoutRevision).toBe(5);
	});

	it('does nothing when activating the current chart', () => {
		const state = createWorkspaceState(100);

		const result = setActiveChartInState(state, state.activeChartId);

		expect(result).toEqual({ state, runQuery: false });
	});

	it('adds a graph chart and makes it active', () => {
		const state = createWorkspaceState(100);

		const result = addChartInState(state);

		expect(result.runQuery).toBe(true);
		expect(result.state.charts).toHaveLength(state.charts.length + 1);
		expect(result.state.activeChartId).toBe('knowledge-map-2');
		expect(result.state.mode).toBe('graph');
	});

	it('renames the active chart without running the query', () => {
		const state = createWorkspaceState(100);

		const result = setActiveChartNameInState(state, '  Project graph  ');

		expect(result.runQuery).toBe(false);
		expect(result.state.charts[0]?.name).toBe('Project graph');
	});

	it('changes chart type with a forced layout revision', () => {
		const state = createWorkspaceState(100);

		const result = setActiveChartTypeInState(state, 'cube');

		expect(result.runQuery).toBe(true);
		expect(result.state.mode).toBe('cube');
		expect(result.state.layoutRevision).toBe(state.layoutRevision + 1);
		expect(result.state.charts[0]?.type).toBe('cube');
	});

	it('changes chart source and runs the query', () => {
		const state = createWorkspaceState(100);

		const result = setActiveChartSourceInState(state, 'curated');

		expect(result.runQuery).toBe(true);
		expect(result.state.chartSource).toBe('curated');
		expect(result.state.charts[0]?.source).toBe('curated');
	});

	it('deletes the active chart and activates the first remaining chart', () => {
		const state = setActiveChartInState(
			addChartInState(createWorkspaceState(100)).state,
			'knowledge-map-2',
		).state;

		const result = deleteActiveChartInState(state);

		expect(result.runQuery).toBe(true);
		expect(result.state.activeChartId).toBe('knowledge-map');
		expect(
			result.state.charts.some((chart) => chart.id === 'knowledge-map-2'),
		).toBe(false);
	});

	it('duplicates the active chart before changing type', () => {
		const state = {
			...createWorkspaceState(100),
			manualLayout: {
				nodes: { 'a.md': { x: 1, y: 2 } },
				groups: [],
			},
			charts: createWorkspaceState(100).charts.map((chart, index) =>
				index === 0
					? {
							...chart,
							layout: {
								...chart.layout,
								manual: { nodes: { 'a.md': { x: 1, y: 2 } }, groups: [] },
							},
						}
					: chart,
			),
		};

		const result = duplicateActiveChartAndSetTypeInState(state, 'flow');

		expect(result.runQuery).toBe(true);
		expect(result.state.charts).toHaveLength(state.charts.length + 1);
		expect(result.state.activeChartId).toBe('knowledge-map-copy');
		expect(result.state.mode).toBe('flow');
		expect(result.state.charts[0]?.layout.manual?.nodes).toEqual({
			'a.md': { x: 1, y: 2 },
		});
		expect(result.state.charts.at(-1)?.type).toBe('flow');
	});

	it('duplicates the active chart before changing source', () => {
		const state = createWorkspaceState(100);

		const result = duplicateActiveChartAndSetSourceInState(state, 'curated');

		expect(result.runQuery).toBe(true);
		expect(result.state.charts).toHaveLength(state.charts.length + 1);
		expect(result.state.activeChartId).toBe('knowledge-map-copy');
		expect(result.state.chartSource).toBe('curated');
		expect(result.state.charts[0]?.source).toBe('query');
		expect(result.state.charts.at(-1)?.source).toBe('curated');
	});
});
