import { describe, expect, it, vi } from 'vitest';
import {
	createWorkspaceSettingsActions,
	createWorkspaceSettingsView,
} from '../ui/workspace/settings-ports';
import type { WorkspaceController } from '../workspace/workspace-controller';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace settings ports', () => {
	it('projects workspace state into domain views', () => {
		const base = createWorkspaceState(200);
		const state = {
			...base,
			connectionFields: ['related', 'related', 'leads-to'],
		};
		const view = createWorkspaceSettingsView(state, {
			metadataFields: ['status'],
			metadataFieldTypes: { status: 'text' },
			metadataFieldValues: { status: ['draft'] },
			filePaths: ['A.md'],
		});

		expect(view.graph.mode).toBe(state.mode);
		expect(view.labels.labelSize).toBe(state.labelSize);
		expect(view.query.currentQuery).toBe(state.query);
		expect(view.query.globalQuery).toBe(state.globalQuery);
		expect(view.styles.chart.nodeOverrides).toBe(state.nodeStyleOverrides);
		expect(view.suggestions.flowRelationFields).toEqual([
			'related',
			'leads-to',
		]);
		expect(view.groups.grouping).toBe(state.grouping);
	});

	it('routes domain actions to the controller facade', () => {
		const setFlowDirection = vi.fn();
		const setLabelSize = vi.fn();
		const updateGlobalQuery = vi.fn();
		const setNodeStyleRules = vi.fn();
		const updateGroup = vi.fn();
		const controller = {
			setFlowDirection,
			setLabelSize,
			updateGlobalQuery,
			setNodeStyleRules,
			updateGroup,
		} as unknown as WorkspaceController;
		const actions = createWorkspaceSettingsActions(controller);

		actions.graph.setFlowDirection('RL');
		actions.labels.setLabelSize(12);
		actions.query.updateGlobal({ maxNodes: 100 });
		actions.styles.setNodeRules([]);
		actions.groups.update('research', { name: 'Research' });

		expect(setFlowDirection).toHaveBeenCalledWith('RL');
		expect(setLabelSize).toHaveBeenCalledWith(12);
		expect(updateGlobalQuery).toHaveBeenCalledWith({ maxNodes: 100 });
		expect(setNodeStyleRules).toHaveBeenCalledWith([]);
		expect(updateGroup).toHaveBeenCalledWith('research', {
			name: 'Research',
		});
	});
});
