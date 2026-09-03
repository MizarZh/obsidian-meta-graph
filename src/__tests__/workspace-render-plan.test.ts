import { describe, expect, it } from 'vitest';
import type { WorkspaceStateChanges } from '../ui/workspace/change-tracker';
import { createWorkspaceRenderPlan } from '../ui/workspace/render-plan';

describe('workspace render plan', () => {
	it('turns rebuild changes into one explicit rebuild action', () => {
		const plan = createWorkspaceRenderPlan(
			changes({
				shouldRebuild: true,
				fitAfterRender: true,
				forceLayout: true,
				styleRulesChanged: true,
			}),
		);

		expect(plan.runtimeGraphSync).toBe('none');
		expect(plan.cancelPendingVisibility).toBe(true);
		expect(plan.rebuild).toEqual({
			fitAfterRender: true,
			forceLayout: true,
		});
		expect(plan.syncSelection).toBe(false);
	});

	it('keeps visibility-only changes on the incremental path', () => {
		const plan = createWorkspaceRenderPlan(
			changes({ graphVisibilityChanged: true }),
		);

		expect(plan.runtimeGraphSync).toBe('visibility');
		expect(plan.cancelPendingVisibility).toBe(false);
		expect(plan.rebuild).toBeUndefined();
		expect(plan.syncSelection).toBe(true);
	});

	it('uses full style sync when visibility and styles change together', () => {
		const plan = createWorkspaceRenderPlan(
			changes({
				graphVisibilityChanged: true,
				styleRulesChanged: true,
			}),
		);

		expect(plan.runtimeGraphSync).toBe('styles');
		expect(plan.syncStyleBaseline).toBe(true);
		expect(plan.cancelPendingVisibility).toBe(true);
	});

	it('makes display, group, and force actions explicit', () => {
		const plan = createWorkspaceRenderPlan(
			changes({
				labelSizeChanged: true,
				manualLayoutChanged: true,
				forceLayoutChanged: true,
				graphForceSettingsChanged: true,
			}),
		);

		expect(plan.syncDisplay).toBe(true);
		expect(plan.syncGroupsBeforeRuntime).toBe(true);
		expect(plan.runtimeGraphSync).toBe('styles');
		expect(plan.applyForceLayoutToggle).toBe(true);
		expect(plan.syncGroupsAfterForceLayoutToggle).toBe(true);
		expect(plan.restartForceLayout).toBe(true);
	});
});

function changes(
	overrides: Partial<WorkspaceStateChanges> = {},
): WorkspaceStateChanges {
	return {
		groupingChanged: false,
		manualLayoutChanged: false,
		fadeDistanceChanged: false,
		labelSizeChanged: false,
		scaleLabelsWithZoomChanged: false,
		threeLabelResolutionChanged: false,
		labelBoldChanged: false,
		labelItalicChanged: false,
		labelPositionChanged: false,
		labelOffsetChanged: false,
		labelThemeChanged: false,
		labelDensityChanged: false,
		cubeFaceOpacityChanged: false,
		cubeSizeChanged: false,
		cubeFreeCameraChanged: false,
		forceLabelsChanged: false,
		graphForceSettingsChanged: false,
		forceLayoutChanged: false,
		styleRulesChanged: false,
		graphVisibilityChanged: false,
		shouldRebuild: false,
		fitAfterRender: false,
		forceLayout: false,
		...overrides,
	};
}
