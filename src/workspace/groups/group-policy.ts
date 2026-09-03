import type {
	ChartGroupDefinition,
	ChartGroupMode,
	ViewMode,
} from '../../core/types';

export type GroupSpatialStrategy =
	'automatic-region' | 'fixed-frame' | 'layout-region' | 'surface' | 'none';

export interface GroupCapabilities {
	available: boolean;
	membership: ChartGroupMode;
	spatial: GroupSpatialStrategy;
	canCreate: boolean;
	canDelete: boolean;
	canReorder: boolean;
	canEditIdentity: boolean;
	canEditAppearance: boolean;
	canEditRule: boolean;
	canAssignManually: boolean;
	canEditGeometry: boolean;
	canMove: boolean;
	canResize: boolean;
}

export function resolveGroupCapabilities(
	mode: ViewMode,
	group?: Pick<ChartGroupDefinition, 'mode'>,
	options: { forceLayoutEnabled?: boolean } = {},
): GroupCapabilities {
	const membership = resolveMembership(mode, group?.mode);
	if (mode === 'graph-3d') {
		return capabilities(membership, 'none', {
			available: false,
		});
	}
	if (mode === 'cube') {
		return capabilities('system', 'surface', {
			available: true,
			canAssignManually: true,
		});
	}
	if (mode === 'free') {
		return capabilities(membership, 'fixed-frame', {
			available: true,
			canCreate: true,
			canDelete: true,
			canReorder: true,
			canEditIdentity: true,
			canEditAppearance: true,
			canEditRule: membership === 'rule',
			canAssignManually: true,
			canEditGeometry: true,
			canMove: true,
			canResize: true,
		});
	}
	if (mode === 'graph') {
		return capabilities(membership, 'automatic-region', {
			available: true,
			canCreate: true,
			canDelete: true,
			canReorder: true,
			canEditIdentity: true,
			canEditAppearance: true,
			canEditRule: membership === 'rule',
			canAssignManually: true,
			canMove: options.forceLayoutEnabled !== true,
		});
	}
	return capabilities('rule', 'layout-region', {
		available: true,
		canCreate: true,
		canDelete: true,
		canReorder: true,
		canEditIdentity: true,
		canEditAppearance: true,
		canEditRule: true,
		canAssignManually: true,
	});
}

function resolveMembership(
	mode: ViewMode,
	membership?: ChartGroupMode,
): ChartGroupMode {
	if (mode === 'cube') return 'system';
	if (
		mode === 'flow' ||
		mode === 'arc' ||
		mode === 'hierarchical-edge-bundling'
	) {
		return 'rule';
	}
	return membership === 'rule' ? 'rule' : 'manual';
}

function capabilities(
	membership: ChartGroupMode,
	spatial: GroupSpatialStrategy,
	overrides: Partial<GroupCapabilities>,
): GroupCapabilities {
	return {
		available: false,
		membership,
		spatial,
		canCreate: false,
		canDelete: false,
		canReorder: false,
		canEditIdentity: false,
		canEditAppearance: false,
		canEditRule: false,
		canAssignManually: false,
		canEditGeometry: false,
		canMove: false,
		canResize: false,
		...overrides,
	};
}
