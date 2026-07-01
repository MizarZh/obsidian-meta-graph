import type { ChartSource, ViewMode, WorkspaceState } from '../../core/types';

export type WorkspaceSwitchWarningSeverity = 'destructive' | 'contextual';

export interface WorkspaceSwitchWarning {
	severity: WorkspaceSwitchWarningSeverity;
	title: string;
	details: string[];
	confirmLabel: string;
}

export function getChartTypeSwitchWarning(
	state: WorkspaceState,
	nextType: ViewMode,
): WorkspaceSwitchWarning | undefined {
	if (state.mode === nextType) {
		return undefined;
	}
	if (hasManualLayout(state)) {
		return {
			severity: 'destructive',
			title: 'Changing layout may reset manual layout',
			details: [
				'Manual node positions and groups will be replaced for this view.',
				'Duplicate the view to keep the current layout.',
			],
			confirmLabel: 'Continue',
		};
	}
	if (getLayoutFamily(state.mode) !== getLayoutFamily(nextType)) {
		return {
			severity: 'contextual',
			title: 'Changing layout may reset layout settings',
			details: ['Layout-specific settings may use defaults for the new layout.'],
			confirmLabel: 'Continue',
		};
	}
	return undefined;
}

export function getChartSourceSwitchWarning(
	state: WorkspaceState,
	nextSource: ChartSource,
): WorkspaceSwitchWarning | undefined {
	if (state.chartSource === nextSource) {
		return undefined;
	}
	if (hasManualLayout(state)) {
		return {
			severity: 'contextual',
			title: 'Source change may hide current layout',
			details: [
				'Manual positions are kept, but they may not apply to the new node set.',
				'Duplicate the view to keep the current source unchanged.',
			],
			confirmLabel: 'Continue',
		};
	}
	if (state.chartSource === 'curated' && state.curated.files.length > 0) {
		return {
			severity: 'contextual',
			title: 'Curated files will not drive this view',
			details: [
				'Curated files are kept, but Query source will use filters instead.',
			],
			confirmLabel: 'Continue',
		};
	}
	return undefined;
}

function hasManualLayout(state: WorkspaceState): boolean {
	return (
		Object.keys(state.manualLayout.nodes).length > 0 ||
		state.manualLayout.groups.length > 0
	);
}

function getLayoutFamily(type: ViewMode): string {
	if (type === 'graph' || type === 'graph-3d' || type === 'cube') {
		return 'force';
	}
	return type;
}
