import { describe, expect, it } from 'vitest';
import {
	createOverlayLayout,
	normalizeOverlayLayout,
	sidePanelsAt,
	activeOverlayTab,
} from '@/workspace/meta-graph/overlay-layout';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setOverlayLayoutInState } from '@/workspace/state/chart-settings';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import {
	createPersistenceContextFromV1,
	parsePersistedMetaGraphDocumentV2,
	serializeWorkspaceStateV2,
} from '@/workspace/meta-graph-v2/codec';

describe('overlay layout', () => {
	it('keeps the existing arrangement for older views and normalizes invalid positions', () => {
		const layout = normalizeOverlayLayout({
			positions: { nodes: 'top', timeline: 'left', trace: 'top-left' },
			hiddenPanels: ['unknown'],
			activeTabs: { right: 'trace' },
		});
		expect(layout.positions.nodes).toBe('left');
		expect(layout.positions.timeline).toBe('bottom');
		expect(layout.positions.trace).toBe('top-left');
		expect(layout.activeTabs).toEqual({});
		expect(sidePanelsAt(layout, 'left')).toEqual(['nodes']);
		expect(sidePanelsAt(layout, 'right')).toEqual([
			'details',
			'pinned',
			'templates',
		]);
	});
	it('groups visible panels by side and falls back when the active tab is hidden or moved', () => {
		const layout = createOverlayLayout();
		layout.positions.pinned = 'left';
		layout.positions.templates = 'left';
		layout.activeTabs.left = 'pinned';
		expect(
			activeOverlayTab(layout, 'left', sidePanelsAt(layout, 'left')),
		).toBe('pinned');
		layout.hiddenPanels = ['pinned'];
		expect(
			activeOverlayTab(layout, 'left', sidePanelsAt(layout, 'left')),
		).toBe('nodes');
		layout.positions.nodes = 'right';
		expect(sidePanelsAt(layout, 'left')).toEqual(['templates']);
	});
	it('persists positions, visibility and active tabs per view without rebuilding the graph', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const state = createWorkspaceState(200, 1.5, document);
		const layout = createOverlayLayout();
		layout.positions.nodes = 'right';
		layout.positions.details = 'left';
		layout.positions.trace = 'top-left';
		layout.positions.legend = 'bottom-left';
		layout.positions.timeline = 'top';
		layout.hiddenPanels = ['templates'];
		layout.activeTabs.right = 'pinned';
		layout.activeTabs['top-left'] = 'trace';
		const next = setOverlayLayoutInState(state, layout);
		expect(
			next.charts.filter((chart) => chart.id !== next.activeChartId),
		).toEqual(
			state.charts.filter((chart) => chart.id !== state.activeChartId),
		);
		expect(
			analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({ shouldRebuild: false, forceLayout: false });
		const text = serializeWorkspaceStateV2(
			next,
			createPersistenceContextFromV1(document),
		);
		const restored = createWorkspaceState(
			200,
			1.5,
			parsePersistedMetaGraphDocumentV2(text, 200, 1.5).document,
		);
		expect(restored.overlayLayout).toEqual(layout);
		expect(restored.showLegend).toBe(state.showLegend);
		expect(restored.timeline).toEqual(state.timeline);
	});
});
