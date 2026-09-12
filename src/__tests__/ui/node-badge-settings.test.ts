import { describe, expect, it } from 'vitest';
import {
	DEFAULT_NODE_BADGES,
	normalizeNodeBadges,
} from '@/workspace/meta-graph/node-badges';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setNodeBadgesInState } from '@/workspace/state/chart-settings';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import {
	createPersistenceContextFromV1,
	parsePersistedMetaGraphDocumentV2,
	serializeWorkspaceStateV2,
} from '@/workspace/meta-graph-v2/codec';

describe('node badge settings', () => {
	it('defaults old documents and bounds invalid settings', () => {
		expect(normalizeNodeBadges(undefined)).toEqual(DEFAULT_NODE_BADGES);
		expect(
			normalizeNodeBadges({
				scale: Infinity,
				position: 'middle',
				enabled: 'yes',
			}),
		).toEqual(DEFAULT_NODE_BADGES);
		expect(normalizeNodeBadges({ scale: 0 }).scale).toBe(0.25);
		expect(normalizeNodeBadges({ scale: 10 }).scale).toBe(2);
	});
	it('persists only this view and changes badges without rebuilding or layout', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const state = createWorkspaceState(200, 1.5, document);
		const config = {
			enabled: false,
			scale: 1.5,
			position: 'bottom-left' as const,
		};
		const next = setNodeBadgesInState(state, config);
		expect(setNodeBadgesInState(next, config)).toBe(next);
		expect(next.charts.filter((c) => c.id !== next.activeChartId)).toEqual(
			state.charts.filter((c) => c.id !== state.activeChartId),
		);
		expect(
			analyzeWorkspaceStateChanges(
				next,
				state,
				createWorkspaceRenderBaseline(state),
			),
		).toMatchObject({ shouldRebuild: false, forceLayout: false });
		const saved = serializeWorkspaceStateV2(
			next,
			createPersistenceContextFromV1(document),
		);
		const restored = createWorkspaceState(
			200,
			1.5,
			parsePersistedMetaGraphDocumentV2(saved, 200, 1.5).document,
		);
		expect(restored.nodeBadges).toEqual(config);
	});
});
