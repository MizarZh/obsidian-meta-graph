import { describe, expect, it } from 'vitest';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
} from '../ui/workspace/change-tracker';
import { createWorkspaceState } from '../workspace/workspace-state';

describe('workspace change tracker', () => {
	it('requests initial rebuild against empty baseline', () => {
		const state = createWorkspaceState(200);

		const changes = analyzeWorkspaceStateChanges(state, state, {});

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(false);
		expect(changes.forceLayout).toBe(false);
	});

	it('detects renderer display updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const nextState = { ...state, labelSize: state.labelSize + 1 };

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.labelSizeChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(false);
	});

	it('detects style-only updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const nextState = {
			...state,
			nodeStyleRules: [
				{
					id: 'red',
					field: 'title',
					operator: 'contains',
					value: 'A',
					color: '#ff0000',
					size: 12,
				},
			],
		} satisfies typeof state;

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.styleRulesChanged).toBe(true);
		expect(changes.shouldRebuild).toBe(false);
	});

	it('detects default and override style updates without rebuild', () => {
		const state = createWorkspaceState(200);
		const baseline = createWorkspaceRenderBaseline(state);
		for (const nextState of [
			{ ...state, defaultNodeStyle: { color: '#ff0000', size: 7 } },
			{
				...state,
				defaultLinkStyle: {
					...state.defaultLinkStyle,
					color: '#00ff00',
				},
			},
			{ ...state, nodeStyleOverrides: { color: '#ff0000' } },
			{ ...state, linkStyleOverrides: { size: 3 } },
		]) {
			const changes = analyzeWorkspaceStateChanges(
				nextState,
				state,
				baseline,
			);

			expect(changes.styleRulesChanged).toBe(true);
			expect(changes.shouldRebuild).toBe(false);
		}
	});

	it('forces flow layout after flow direction changes', () => {
		const state = createWorkspaceState(200);
		const nextState = { ...state, flowDirection: 'RL' as const };

		const changes = analyzeWorkspaceStateChanges(
			nextState,
			state,
			createWorkspaceRenderBaseline(state),
		);

		expect(changes.shouldRebuild).toBe(true);
		expect(changes.fitAfterRender).toBe(true);
		expect(changes.forceLayout).toBe(true);
	});
});
