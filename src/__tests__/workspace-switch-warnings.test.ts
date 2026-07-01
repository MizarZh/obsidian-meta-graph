import { describe, expect, it } from 'vitest';
import {
	getChartSourceSwitchWarning,
	getChartTypeSwitchWarning,
} from '../workspace/state/switch-warnings';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('workspace switch warnings', () => {
	it('warns when changing layout would replace manual layout', () => {
		const state = {
			...createWorkspaceState(100),
			manualLayout: {
				nodes: { 'a.md': { x: 1, y: 2 } },
				groups: [],
			},
		};

		const warning = getChartTypeSwitchWarning(state, 'flow');

		expect(warning?.severity).toBe('destructive');
		expect(warning?.title).toBe('Changing layout may reset manual layout');
	});

	it('does not warn when selecting the current layout', () => {
		const state = createWorkspaceState(100);

		expect(getChartTypeSwitchWarning(state, 'graph')).toBeUndefined();
	});

	it('warns when source changes with manual layout', () => {
		const state = {
			...createWorkspaceState(100),
			manualLayout: {
				nodes: {},
				groups: [
					{
						id: 'group',
						name: 'Group',
						x: 0,
						y: 0,
						width: 100,
						height: 100,
						color: '#ffffff',
						mode: 'manual' as const,
						padding: 16,
					},
				],
			},
		};

		const warning = getChartSourceSwitchWarning(state, 'curated');

		expect(warning?.severity).toBe('contextual');
		expect(warning?.title).toBe('Source change may hide current layout');
	});

	it('warns when curated files stop driving the view', () => {
		const state = {
			...createWorkspaceState(100),
			chartSource: 'curated' as const,
			curated: {
				...createWorkspaceState(100).curated,
				files: [{ path: 'a.md' }],
			},
		};

		const warning = getChartSourceSwitchWarning(state, 'query');

		expect(warning?.title).toBe('Curated files will not drive this view');
	});
});
