import { describe, expect, it } from 'vitest';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setShowTraceInState } from '@/workspace/state/chart-settings';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import {
	createPersistenceContextFromV1,
	parsePersistedMetaGraphDocumentV2,
	serializeWorkspaceStateV2,
} from '@/workspace/meta-graph-v2/codec';

describe('trace panel', () => {
	it('persists only panel visibility per chart without rebuilding or saving a trace', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const state = createWorkspaceState(200, 1.5, document);
		expect(state.showTrace).toBe(false);
		const next = setShowTraceInState(state, true);
		expect(next.showTrace).toBe(true);
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
		next.trace = { mode: 'path', source: 'a', target: 'b' };
		const text = serializeWorkspaceStateV2(
			next,
			createPersistenceContextFromV1(document),
		);
		const restored = createWorkspaceState(
			200,
			1.5,
			parsePersistedMetaGraphDocumentV2(text, 200, 1.5).document,
		);
		expect(restored.showTrace).toBe(true);
		expect(restored.trace).toBeUndefined();
		const hidden = setShowTraceInState(restored, false);
		const saved = serializeWorkspaceStateV2(
			hidden,
			createPersistenceContextFromV1(document),
		);
		expect(
			createWorkspaceState(
				200,
				1.5,
				parsePersistedMetaGraphDocumentV2(saved, 200, 1.5).document,
			).showTrace,
		).toBe(false);
	});
});
