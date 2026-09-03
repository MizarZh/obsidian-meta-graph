import type { WorkspaceStateChanges } from './change-tracker';

const DISPLAY_CHANGE_KEYS = [
	'fadeDistanceChanged',
	'labelSizeChanged',
	'scaleLabelsWithZoomChanged',
	'threeLabelResolutionChanged',
	'labelBoldChanged',
	'labelItalicChanged',
	'labelPositionChanged',
	'labelOffsetChanged',
	'labelThemeChanged',
	'labelDensityChanged',
	'cubeFaceOpacityChanged',
	'cubeSizeChanged',
	'cubeFreeCameraChanged',
	'forceLabelsChanged',
] as const satisfies readonly (keyof WorkspaceStateChanges)[];

export type RuntimeGraphSync = 'none' | 'visibility' | 'styles';

export interface WorkspaceRenderPlan {
	syncDisplay: boolean;
	syncGroupsBeforeRuntime: boolean;
	runtimeGraphSync: RuntimeGraphSync;
	syncStyleBaseline: boolean;
	applyForceLayoutToggle: boolean;
	syncGroupsAfterForceLayoutToggle: boolean;
	restartForceLayout: boolean;
	cancelPendingVisibility: boolean;
	rebuild?: {
		fitAfterRender: boolean;
		forceLayout: boolean;
	};
	syncSelection: boolean;
}

export function createWorkspaceRenderPlan(
	changes: WorkspaceStateChanges,
): WorkspaceRenderPlan {
	const runtimeGraphChanged =
		changes.styleRulesChanged ||
		changes.manualLayoutChanged ||
		changes.graphVisibilityChanged;
	const runtimeGraphSync = resolveRuntimeGraphSync(
		changes,
		runtimeGraphChanged,
	);

	return {
		syncDisplay: DISPLAY_CHANGE_KEYS.some((key) => changes[key]),
		syncGroupsBeforeRuntime: changes.manualLayoutChanged,
		runtimeGraphSync,
		syncStyleBaseline: runtimeGraphSync !== 'none',
		applyForceLayoutToggle: changes.forceLayoutChanged,
		syncGroupsAfterForceLayoutToggle: changes.forceLayoutChanged,
		restartForceLayout: changes.graphForceSettingsChanged,
		cancelPendingVisibility:
			changes.shouldRebuild || runtimeGraphSync === 'styles',
		rebuild: changes.shouldRebuild
			? {
					fitAfterRender: changes.fitAfterRender,
					forceLayout: changes.forceLayout,
				}
			: undefined,
		syncSelection: !changes.shouldRebuild,
	};
}

function resolveRuntimeGraphSync(
	changes: WorkspaceStateChanges,
	runtimeGraphChanged: boolean,
): RuntimeGraphSync {
	if (changes.shouldRebuild || !runtimeGraphChanged) {
		return 'none';
	}
	if (
		changes.graphVisibilityChanged &&
		!changes.styleRulesChanged &&
		!changes.manualLayoutChanged
	) {
		return 'visibility';
	}
	return 'styles';
}
