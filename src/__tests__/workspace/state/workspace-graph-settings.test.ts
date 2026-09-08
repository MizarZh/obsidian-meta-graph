import { describe, expect, it } from 'vitest';
import { getWorkspaceGraphForceSettings } from '@/ui/workspace/graph-settings';
import { createWorkspaceState } from '@/workspace/state/workspace-state';
import {
	resetGraphForcesInState,
	setGraphForceSettingInState,
} from '@/workspace/state/chart-settings';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '@/ui/workspace/change-tracker';
import { DEFAULT_GRAPH_FORCE_SETTINGS } from '@/layouts/force-layout';

describe('workspace graph force settings', () => {
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
