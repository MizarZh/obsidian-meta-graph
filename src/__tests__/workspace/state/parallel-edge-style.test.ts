import { describe, expect, it } from 'vitest';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import { setParallelEdgeStyleInState } from '@/workspace/state/chart-settings';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import {
	createPersistenceContextFromV1,
	serializeWorkspaceStateV2,
	parsePersistedMetaGraphDocumentV2,
} from '@/workspace/meta-graph-v2/codec';
import { createDefaultMetaGraphDocument } from '@/workspace/meta-graph-model';

describe('parallel edge style', () => {
	it('round trips per chart and switches without rebuilding or layout', () => {
		const document = createDefaultMetaGraphDocument(200, 1.5);
		const state = createWorkspaceState(200, 1.5, document);
		const next = setParallelEdgeStyleInState(state, 'curve');
		expect(state.parallelEdgeStyle).toBe('straight');
		expect(next.parallelEdgeStyle).toBe('curve');
		expect(next.charts[0]!.layout).toBe(state.charts[0]!.layout);
		const changes = analyzeWorkspaceStateChanges(
			next,
			state,
			createWorkspaceRenderBaseline(state),
		);
		expect(changes.parallelEdgeStyleChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(false);
		expect(changes.forceLayout).toBe(false);
		const saved = serializeWorkspaceStateV2(
			next,
			createPersistenceContextFromV1(document),
		);
		expect(saved.charts[0]!.extensions).toMatchObject({
			'meta-graph': { parallelEdgeStyle: 'curve' },
		});
		const parsed = parsePersistedMetaGraphDocumentV2(saved, 200, 1.5);
		expect(
			createWorkspaceState(200, 1.5, parsed.document).parallelEdgeStyle,
		).toBe('curve');
		const straight = setParallelEdgeStyleInState(next, 'straight');
		expect(
			serializeWorkspaceStateV2(straight, parsed.persistence).charts[0]!
				.extensions?.['meta-graph'],
		).toBeUndefined();
	});
});
