import { describe, expect, it } from 'vitest';
import { createMinimapTransform, minimapWheelZoom } from '@/ui/workspace/minimap-geometry';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setShowMinimapInState } from '@/workspace/state/chart-settings';
import { analyzeWorkspaceStateChanges, createWorkspaceRenderBaseline } from '@/ui/workspace/change-tracker';
import { createPersistenceContextFromV1, parsePersistedMetaGraphDocumentV2, serializeWorkspaceStateV2 } from '@/workspace/meta-graph-v2/codec';

describe('minimap', () => {
	it('zooms in/out, normalizes wheel units, and respects graph zoom limits', () => {
		expect(minimapWheelZoom(100, -100, 0)).toBeGreaterThan(100);
		expect(minimapWheelZoom(100, 100, 0)).toBeLessThan(100);
		expect(minimapWheelZoom(100, 1, 1)).toBe(minimapWheelZoom(100, 16, 0));
		expect(minimapWheelZoom(100, 1, 2)).toBe(minimapWheelZoom(100, 120, 0));
		expect(minimapWheelZoom(400, -100, 0)).toBe(400);
		expect(minimapWheelZoom(25, 100, 0)).toBe(25);
		expect(minimapWheelZoom(100, NaN, 0)).toBe(100);
	});
	it('fits bounds with uniform scale and the shared upward graph Y axis', () => {
		const project = createMinimapTransform([{x: -50, y: -25}, {x: 50, y: 25}], 180, 120)!;
		expect(project({x: 0, y: 0})).toEqual({x: 90, y: 60});
		expect(project({x: -50, y: 25})).toEqual({x: 10, y: 20});
		expect(project({x: 50, y: -25})).toEqual({x: 170, y: 100});
	});
	it('handles empty, invalid, and single-node bounds', () => {
		expect(createMinimapTransform([], 180, 120)).toBeUndefined();
		expect(createMinimapTransform([{x: NaN, y: 0}], 180, 120)).toBeUndefined();
		const project = createMinimapTransform([{x: 12, y: 30}], 180, 120)!;
		expect(project({x: 12, y: 30})).toEqual({x: 90, y: 60});
	});
	it('converts minimap navigation back into graph coordinates', () => {
		const project = createMinimapTransform([{x: -50, y: -25}, {x: 50, y: 25}], 180, 120)!;
		for (const point of [{x: -50, y: 25}, {x: 12, y: -8}, {x: 150, y: 200}]) {
			const restored = project.invert(project(point));
			expect(restored.x).toBeCloseTo(point.x);
			expect(restored.y).toBeCloseTo(point.y);
		}
	});
	it('defaults off, persists per chart, and does not request a graph rebuild', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const state = createWorkspaceState(200, 1.5, document);
		expect(state.showMinimap).toBe(false);
		const next = setShowMinimapInState(state, true);
		expect(next.showMinimap).toBe(true);
		expect(next.charts.filter((chart) => chart.id !== next.activeChartId)).toEqual(state.charts.filter((chart) => chart.id !== state.activeChartId));
		expect(analyzeWorkspaceStateChanges(next, state, createWorkspaceRenderBaseline(state)).shouldRebuild).toBe(false);
		const text = serializeWorkspaceStateV2(next, createPersistenceContextFromV1(document));
		const parsed = parsePersistedMetaGraphDocumentV2(text, 200, 1.5);
		expect(createWorkspaceState(200, 1.5, parsed.document).showMinimap).toBe(true);
	});
});
