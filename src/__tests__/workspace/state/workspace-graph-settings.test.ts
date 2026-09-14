import { describe, expect, it } from 'vitest';
import { getWorkspaceGraphForceSettings } from '@/ui/workspace/graph-settings';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import {
	resetGraphForcesInState,
	setNetworkLayoutInState,
	setFlowLayoutInState,
	setStableLayoutInState,
	setGraphForceSettingInState,
} from '@/workspace/state/chart-settings';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import { DEFAULT_GRAPH_FORCE_SETTINGS } from '@/layouts/force-layout';

describe('workspace graph force settings', () => {
	it('selects interactive ELK only for Flow and forces layout', () => {
		const original = createWorkspaceState(200, 2);
		expect(setFlowLayoutInState(original, 'elk-interactive')).toBe(
			original,
		);
		const state = {
			...original,
			mode: 'flow' as const,
			charts: original.charts.map((chart) => ({
				...chart,
				type: 'flow' as const,
			})),
		};
		const next = setFlowLayoutInState(state, 'elk-interactive');
		expect(next.charts[0]!.layout.flowLayout).toBe('elk-interactive');
		expect(setFlowLayoutInState(next, 'elk-interactive')).toBe(next);
		const changes = analyzeWorkspaceStateChanges(
			next,
			state,
			createWorkspaceRenderBaseline(state),
		);
		expect(changes.shouldRebuild).toBe(true);
		expect(changes.forceLayout).toBe(true);
		expect(
			setFlowLayoutInState(next, 'elk').charts[0]!.layout.flowLayout,
		).toBe('elk');
	});
	it('enables Stable only for Network and requests a fresh layout', () => {
		const state = createWorkspaceState(200, 2);
		const next = setStableLayoutInState(state, true);
		expect(next.charts[0]!.layout.stableLayout).toBe(true);
		expect(setStableLayoutInState(next, true)).toBe(next);
		expect(
			setStableLayoutInState({ ...state, mode: 'flow' }, true).charts,
		).toBe(state.charts);
		const changes = analyzeWorkspaceStateChanges(
			next,
			state,
			createWorkspaceRenderBaseline(state),
		);
		expect(changes.shouldRebuild).toBe(true);
		expect(changes.forceLayout).toBe(true);
	});
	it('selects Multilevel stress only for Network and requests a fresh layout', () => {
		const state = createWorkspaceState(200, 2);
		const next = setNetworkLayoutInState(state, 'multilevel-stress');
		expect(next.charts[0]!.layout.networkLayout).toBe('multilevel-stress');
		expect(setNetworkLayoutInState(next, 'multilevel-stress')).toBe(next);
		expect(
			setNetworkLayoutInState(
				{ ...state, mode: 'flow' },
				'multilevel-stress',
			).charts,
		).toBe(state.charts);
		const changes = analyzeWorkspaceStateChanges(
			next,
			state,
			createWorkspaceRenderBaseline(state),
		);
		expect(changes.shouldRebuild).toBe(true);
		expect(changes.forceLayout).toBe(true);
	});
	it('updates parameters without rebuilding the graph or cloning groups', () => {
		const state = createWorkspaceState(200, 2);
		const next = setGraphForceSettingInState(state, 'repelForce', 3);
		const changes = analyzeWorkspaceStateChanges(
			next,
			state,
			createWorkspaceRenderBaseline(state),
		);
		expect(changes.shouldRebuild).toBe(false);
		expect(changes.graphForceSettingsChanged).toBe(true);
		expect(next.grouping).toBe(state.grouping);
		expect(next.charts[0]?.layout.repelForce).toBe(3);
		const reset = resetGraphForcesInState(next);
		expect(getWorkspaceGraphForceSettings(reset)).toEqual(
			DEFAULT_GRAPH_FORCE_SETTINGS,
		);
		expect(reset.grouping).toBe(state.grouping);
	});
	it('maps workspace graph force fields to simulation settings', () => {
		expect(
			getWorkspaceGraphForceSettings({
				graphCenterForce: 1,
				graphRepelForce: 2,
				graphLinkForce: 3,
				graphDragLinkForce: 4,
				graphReturnForce: 5,
				graphLinkDistance: 6,
			}),
		).toEqual({
			centerForce: 1,
			repelForce: 2,
			linkForce: 3,
			dragLinkForce: 4,
			returnForce: 5,
			linkDistance: 6,
		});
	});
});
