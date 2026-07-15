import type {
	ChartGroup,
	MetaGraphChart,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import {
	createUniqueDefaultGroup,
	findManualPlacement,
	getManualGroup,
	moveManualNodesToGroup,
	normalizeGroupPatch,
	readGroupPlacementBounds,
} from './manual-layout';
import { toGroupDefinition } from '../meta-graph/grouping';
import { updateActiveChartState } from './state-updaters';

type Position = { x: number; y: number };

export function setManualNodePositionInState(
	state: WorkspaceState,
	nodeId: NodeId,
	position: Position,
	groupId?: string,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const previous = manual.nodes[nodeId];
	const nextPlacement = groupId
		? { x: position.x, y: position.y, groupId }
		: { x: position.x, y: position.y };
	if (
		previous?.x === nextPlacement.x &&
		previous?.y === nextPlacement.y &&
		previous?.groupId === nextPlacement.groupId
	) {
		return state;
	}
	return updateActiveChartState(state, {
		...(activeChart.type === 'cube'
			? {}
			: {
					grouping: setGroupingOverrides(
						activeChart.grouping,
						[nodeId],
						groupId ?? (previous?.groupId ? null : undefined),
					),
				}),
		layout: {
			...activeChart.layout,
			manual: {
				...manual,
				nodes: {
					...manual.nodes,
					[nodeId]: nextPlacement,
				},
			},
		},
	});
}

export function setNodeGroupInState(
	state: WorkspaceState,
	nodeId: NodeId,
	groupId?: string,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (activeChart.type !== 'free' && activeChart.type !== 'cube') {
		return state;
	}
	if (activeChart.type === 'cube' && !groupId) {
		return state;
	}
	const layout = moveManualNodesToGroup(
		activeChart.layout,
		[nodeId],
		groupId || undefined,
	);
	return layout === activeChart.layout
		? state
		: updateActiveChartState(state, {
				layout,
				...(activeChart.type === 'cube'
					? {}
					: {
							grouping: setGroupingOverrides(
								activeChart.grouping,
								[nodeId],
								groupId ?? null,
							),
						}),
			});
}

export function addGroupInState(state: WorkspaceState): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (activeChart.type === 'cube') {
		return state;
	}
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const group = createUniqueDefaultGroup(manual.groups);
	return updateActiveChartState(state, {
		grouping: {
			...activeChart.grouping,
			groups: [...activeChart.grouping.groups, toGroupDefinition(group)],
		},
		layout: {
			...activeChart.layout,
			manual: {
				...manual,
				groups: [...manual.groups, group],
			},
		},
	});
}

export function updateGroupInState(
	state: WorkspaceState,
	groupId: string,
	patch: Partial<ChartGroup>,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const groups = manual.groups.map((group) =>
		group.id === groupId ? normalizeGroupPatch(group, patch) : group,
	);
	const updatedGroup = groups.find((group) => group.id === groupId);
	const groupingGroups = activeChart.grouping.groups.map((group) =>
		group.id === groupId && updatedGroup
			? toGroupDefinition(updatedGroup)
			: group,
	);
	return updateActiveChartState(state, {
		grouping: {
			...activeChart.grouping,
			groups: activeChart.grouping.groups.some(
				(group) => group.id === groupId,
			)
				? groupingGroups
				: updatedGroup
					? [...groupingGroups, toGroupDefinition(updatedGroup)]
					: groupingGroups,
		},
		layout: {
			...activeChart.layout,
			manual: {
				...manual,
				groups,
			},
		},
	});
}

export function moveGroupInState(
	state: WorkspaceState,
	groupId: string,
	delta: Position,
): WorkspaceState {
	if (delta.x === 0 && delta.y === 0) {
		return state;
	}
	const activeChart = getActiveChart(state);
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const groups = manual.groups.map((group) =>
		group.id === groupId
			? {
					...group,
					x: group.x + delta.x,
					y: group.y + delta.y,
				}
			: group,
	);
	const nodes = Object.fromEntries(
		Object.entries(manual.nodes).map(([nodeId, placement]) => [
			nodeId,
			placement.groupId === groupId
				? {
						...placement,
						x: placement.x + delta.x,
						y: placement.y + delta.y,
					}
				: placement,
		]),
	);
	return updateActiveChartState(state, {
		layout: {
			...activeChart.layout,
			manual: {
				...manual,
				nodes,
				groups,
			},
		},
	});
}

export function resizeGroupInState(
	state: WorkspaceState,
	groupId: string,
	geometry: Pick<ChartGroup, 'x' | 'y' | 'width' | 'height'>,
): WorkspaceState {
	return updateGroupInState(state, groupId, geometry);
}

export function moveCuratedFilesToGroupInState(
	state: WorkspaceState,
	paths: NodeId[],
	groupId?: string,
): WorkspaceState {
	if (paths.length === 0) {
		return state;
	}
	const activeChart = getActiveChart(state);
	const layout = moveManualNodesToGroup(activeChart.layout, paths, groupId);
	return layout === activeChart.layout
		? state
		: updateActiveChartState(
				state,
				{
					layout,
					...(activeChart.type === 'cube'
						? {}
						: {
								grouping: setGroupingOverrides(
									activeChart.grouping,
									paths,
									groupId ?? null,
								),
							}),
				},
				true,
			);
}

export function placeNodeInDefaultGroupInState(
	state: WorkspaceState,
	path: NodeId,
	groupId?: string,
): WorkspaceState {
	if (!groupId) {
		return state;
	}
	const activeChart = getActiveChart(state);
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const group = getManualGroup(activeChart.layout, activeChart.type, groupId);
	if (!group) {
		return state;
	}
	const occupied = Object.entries(manual.nodes)
		.filter(
			([nodeId, placement]) =>
				nodeId !== path && placement.groupId === group.id,
		)
		.map(([, placement]) => ({ x: placement.x, y: placement.y }));
	return setManualNodePositionInState(
		state,
		path,
		findManualPlacement(
			readGroupPlacementBounds(group),
			occupied,
			group.id,
		),
		group.id,
	);
}

export function deleteGroupInState(
	state: WorkspaceState,
	groupId: string,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (activeChart.type === 'cube') {
		return state;
	}
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const groups = manual.groups.filter((group) => group.id !== groupId);
	const nodes = Object.fromEntries(
		Object.entries(manual.nodes).map(([nodeId, placement]) => [
			nodeId,
			placement.groupId === groupId
				? { x: placement.x, y: placement.y }
				: placement,
		]),
	);
	return updateActiveChartState(state, {
		grouping: {
			groups: activeChart.grouping.groups.filter(
				(group) => group.id !== groupId,
			),
			overrides: Object.fromEntries(
				Object.entries(activeChart.grouping.overrides).filter(
					([, assignedGroupId]) => assignedGroupId !== groupId,
				),
			),
		},
		layout: {
			...activeChart.layout,
			manual: {
				...manual,
				nodes,
				groups,
			},
		},
	});
}

function setGroupingOverrides(
	grouping: WorkspaceState['grouping'],
	nodeIds: readonly NodeId[],
	groupId: string | null | undefined,
): WorkspaceState['grouping'] {
	if (groupId === undefined) {
		return grouping;
	}
	const overrides = { ...grouping.overrides };
	for (const nodeId of nodeIds) {
		overrides[nodeId] = groupId;
	}
	return { ...grouping, overrides };
}

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}
