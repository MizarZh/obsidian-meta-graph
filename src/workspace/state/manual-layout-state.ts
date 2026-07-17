import type {
	ChartGroup,
	ChartGroupDefinition,
	GroupFrame,
	MetaGraphChart,
	NodeId,
	WorkspaceState,
} from '../../core/types';
import { normalizeGroupFrameForShape } from '../../layouts/group-shape';
import { resolveChartGroupOwnership } from '../../query/group-ownership';
import {
	createUniqueDefaultGroup,
	findManualPlacement,
	getManualGroup,
	moveManualNodesToGroup,
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
	const nextPlacement =
		activeChart.type === 'cube' && groupId
			? { x: position.x, y: position.y, groupId }
			: { x: position.x, y: position.y };
	const grouping =
		activeChart.type === 'cube'
			? activeChart.grouping
			: assignGroupingOverrides(
					activeChart.grouping,
					[nodeId],
					groupId ?? null,
				);
	if (
		previous?.x === nextPlacement.x &&
		previous?.y === nextPlacement.y &&
		previous?.groupId === nextPlacement.groupId &&
		grouping === activeChart.grouping
	) {
		return state;
	}
	return updateActiveChartState(state, {
		...(activeChart.type === 'cube' ? {} : { grouping }),
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
	groupId?: string | null,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (
		activeChart.type !== 'graph' &&
		activeChart.type !== 'free' &&
		activeChart.type !== 'cube'
	) {
		return state;
	}
	if (activeChart.type === 'cube' && !groupId) {
		return state;
	}
	if (activeChart.type !== 'free' && activeChart.type !== 'cube') {
		const grouping = assignGroupingOverrides(
			activeChart.grouping,
			[nodeId],
			groupId,
		);
		return grouping === activeChart.grouping
			? state
			: updateActiveChartState(state, { grouping });
	}
	const definition =
		typeof groupId === 'string'
			? activeChart.grouping.groups.find((group) => group.id === groupId)
			: undefined;
	const layout =
		activeChart.type === 'cube' || groupId !== undefined
			? moveManualNodesToGroup(
					activeChart.layout,
					[nodeId],
					groupId ?? undefined,
					definition,
				)
			: activeChart.layout;
	const grouping =
		activeChart.type === 'cube'
			? activeChart.grouping
			: assignGroupingOverrides(activeChart.grouping, [nodeId], groupId);
	return layout === activeChart.layout && grouping === activeChart.grouping
		? state
		: updateActiveChartState(state, {
				layout,
				...(activeChart.type === 'cube' ? {} : { grouping }),
			});
}

export function addGroupInState(state: WorkspaceState): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (activeChart.type === 'cube' || activeChart.type === 'graph-3d') {
		return state;
	}
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const defaultGroup = createUniqueDefaultGroup(activeChart.grouping.groups);
	const manualModeAllowed = supportsManualGroupMode(activeChart.type);
	const group: ChartGroupDefinition = manualModeAllowed
		? defaultGroup
		: {
				...defaultGroup,
				mode: 'rule',
				rule: createEmptyGroupRule(defaultGroup.id),
			};
	const frame = createDefaultGroupFrame(
		Object.keys(manual.groupFrames ?? {}).length,
	);
	return updateActiveChartState(state, {
		grouping: {
			...activeChart.grouping,
			groups: [...activeChart.grouping.groups, toGroupDefinition(group)],
		},
		...(manualModeAllowed
			? {
					layout: {
						...activeChart.layout,
						manual: {
							...manual,
							groupFrames: {
								...manual.groupFrames,
								[group.id]: frame,
							},
						},
					},
				}
			: {}),
	});
}

export function updateGroupInState(
	state: WorkspaceState,
	groupId: string,
	patch: Partial<ChartGroup>,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (activeChart.type === 'cube' || activeChart.type === 'graph-3d') {
		return state;
	}
	const manualModeAllowed = supportsManualGroupMode(activeChart.type);
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const groupingGroups = activeChart.grouping.groups.map((group) => {
		if (group.id !== groupId) {
			return group;
		}
		return normalizeGroupDefinitionPatch(
			group,
			manualModeAllowed
				? patch
				: {
						...patch,
						mode: 'rule',
						rule: group.rule ?? createEmptyGroupRule(group.id),
					},
		);
	});
	if (!groupingGroups.some((group) => group.id === groupId)) {
		return state;
	}
	const currentFrame = manual.groupFrames?.[groupId];
	const updatedGroup = groupingGroups.find((group) => group.id === groupId);
	let nextFrame =
		currentFrame && (hasGroupFramePatch(patch) || patch.shape !== undefined)
			? normalizeGroupFramePatch(currentFrame, patch)
			: undefined;
	if (nextFrame && updatedGroup?.shape === 'circle') {
		nextFrame = normalizeGroupFrameForShape(nextFrame, 'circle');
	}
	return updateActiveChartState(state, {
		grouping: {
			...activeChart.grouping,
			groups: groupingGroups,
		},
		...(nextFrame
			? {
					layout: {
						...activeChart.layout,
						manual: {
							...manual,
							groupFrames: {
								...manual.groupFrames,
								[groupId]: nextFrame,
							},
						},
					},
				}
			: {}),
	});
}

export function moveGroupInState(
	state: WorkspaceState,
	groupId: string,
	delta: Position,
	committedPositions?: Readonly<Record<NodeId, Position>>,
): WorkspaceState {
	if (delta.x === 0 && delta.y === 0) {
		return state;
	}
	const activeChart = getActiveChart(state);
	if (!supportsManualGroupMode(activeChart.type)) {
		return state;
	}
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const frame = manual.groupFrames?.[groupId];
	if (!frame) {
		return state;
	}
	const nodes = { ...manual.nodes };
	for (const nodeId of getCanonicalGroupMemberIds(
		state,
		activeChart,
		groupId,
	)) {
		const committed = committedPositions?.[nodeId];
		const placement = nodes[nodeId];
		if (committed) {
			nodes[nodeId] = { x: committed.x, y: committed.y };
		} else if (placement) {
			nodes[nodeId] = {
				x: placement.x + delta.x,
				y: placement.y + delta.y,
			};
		}
	}
	return updateActiveChartState(state, {
		layout: {
			...activeChart.layout,
			manual: {
				...manual,
				nodes,
				groupFrames: {
					...manual.groupFrames,
					[groupId]: {
						...frame,
						x: frame.x + delta.x,
						y: frame.y + delta.y,
					},
				},
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
	if (
		activeChart.type !== 'graph' &&
		activeChart.type !== 'free' &&
		activeChart.type !== 'cube'
	) {
		return state;
	}
	if (activeChart.type !== 'free' && activeChart.type !== 'cube') {
		const grouping = assignGroupingOverrides(
			activeChart.grouping,
			paths,
			groupId ?? null,
		);
		return grouping === activeChart.grouping
			? state
			: updateActiveChartState(state, { grouping });
	}
	const definition = groupId
		? activeChart.grouping.groups.find((group) => group.id === groupId)
		: undefined;
	const layout = moveManualNodesToGroup(
		activeChart.layout,
		paths,
		groupId,
		definition,
	);
	const grouping =
		activeChart.type === 'cube'
			? activeChart.grouping
			: assignGroupingOverrides(
					activeChart.grouping,
					paths,
					groupId ?? null,
				);
	return layout === activeChart.layout && grouping === activeChart.grouping
		? state
		: updateActiveChartState(
				state,
				{
					layout,
					...(activeChart.type === 'cube' ? {} : { grouping }),
				},
				true,
			);
}

export function reorderGroupInState(
	state: WorkspaceState,
	groupId: string,
	direction: -1 | 1,
): WorkspaceState {
	const activeChart = getActiveChart(state);
	if (activeChart.type === 'cube') {
		return state;
	}
	const index = activeChart.grouping.groups.findIndex(
		(group) => group.id === groupId,
	);
	const targetIndex = index + direction;
	if (
		index < 0 ||
		targetIndex < 0 ||
		targetIndex >= activeChart.grouping.groups.length
	) {
		return state;
	}
	const groups = [...activeChart.grouping.groups];
	const [group] = groups.splice(index, 1);
	if (!group) {
		return state;
	}
	groups.splice(targetIndex, 0, group);
	return updateActiveChartState(state, {
		grouping: { ...activeChart.grouping, groups },
	});
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
	if (
		activeChart.type !== 'graph' &&
		activeChart.type !== 'free' &&
		activeChart.type !== 'cube'
	) {
		return state;
	}
	const manual = activeChart.layout.manual ?? { nodes: {}, groups: [] };
	const definition = activeChart.grouping.groups.find(
		(group) => group.id === groupId,
	);
	const group = getManualGroup(
		activeChart.layout,
		activeChart.type,
		groupId,
		definition,
	);
	if (!group) {
		return state;
	}
	const members = getCanonicalGroupMemberIds(state, activeChart, groupId);
	const occupied = Object.entries(manual.nodes)
		.filter(([nodeId]) => nodeId !== path && members.has(nodeId))
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
	const groupFrames = { ...manual.groupFrames };
	delete groupFrames[groupId];
	const nodes = Object.fromEntries(
		Object.entries(manual.nodes).map(([nodeId, placement]) => [
			nodeId,
			placement.groupId === groupId
				? { x: placement.x, y: placement.y }
				: placement,
		]),
	);
	const templateOverrides = Object.fromEntries(
		Object.entries(activeChart.templateOverrides).filter(
			([, override]) => override.defaultGroupId !== groupId,
		),
	);
	const nextState = updateActiveChartState(state, {
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
				groups: manual.groups.filter((group) => group.id !== groupId),
				groupFrames,
			},
		},
		templateOverrides,
	});
	return {
		...nextState,
		dock: {
			...nextState.dock,
			templates: nextState.dock.templates.map((template) =>
				template.defaultGroupId === groupId
					? { ...template, defaultGroupId: undefined }
					: template,
			),
		},
	};
}

function assignGroupingOverrides(
	grouping: WorkspaceState['grouping'],
	nodeIds: readonly NodeId[],
	groupId: string | null | undefined,
): WorkspaceState['grouping'] {
	if (
		typeof groupId === 'string' &&
		!grouping.groups.some((group) => group.id === groupId)
	) {
		return grouping;
	}
	const overrides = { ...grouping.overrides };
	let changed = false;
	for (const nodeId of nodeIds) {
		if (groupId === undefined) {
			if (Object.prototype.hasOwnProperty.call(overrides, nodeId)) {
				delete overrides[nodeId];
				changed = true;
			}
		} else if (overrides[nodeId] !== groupId) {
			overrides[nodeId] = groupId;
			changed = true;
		}
	}
	return changed ? { ...grouping, overrides } : grouping;
}

function normalizeGroupFramePatch(
	frame: GroupFrame,
	patch: Partial<ChartGroup>,
): GroupFrame {
	return {
		x:
			typeof patch.x === 'number' && Number.isFinite(patch.x)
				? patch.x
				: frame.x,
		y:
			typeof patch.y === 'number' && Number.isFinite(patch.y)
				? patch.y
				: frame.y,
		width:
			typeof patch.width === 'number' && Number.isFinite(patch.width)
				? Math.max(0.8, patch.width)
				: frame.width,
		height:
			typeof patch.height === 'number' && Number.isFinite(patch.height)
				? Math.max(0.6, patch.height)
				: frame.height,
	};
}

function hasGroupFramePatch(patch: Partial<ChartGroup>): boolean {
	return (
		patch.x !== undefined ||
		patch.y !== undefined ||
		patch.width !== undefined ||
		patch.height !== undefined
	);
}

function getCanonicalGroupMemberIds(
	state: WorkspaceState,
	chart: MetaGraphChart,
	groupId: string,
): Set<NodeId> {
	const members = new Set<NodeId>();
	for (const [nodeId, assignedGroupId] of Object.entries(
		chart.grouping.overrides,
	)) {
		if (assignedGroupId === groupId) {
			members.add(nodeId);
		}
	}
	const ownership = resolveChartGroupOwnership(
		state.projection?.nodes ?? [],
		chart.grouping,
	);
	for (const nodeId of ownership.membersByGroup.get(groupId) ?? []) {
		members.add(nodeId);
	}
	return members;
}

function supportsManualGroupMode(type: MetaGraphChart['type']): boolean {
	return type === 'graph' || type === 'free';
}

function createEmptyGroupRule(groupId: string) {
	return {
		id: `group-rule-${groupId}`,
		kind: 'group' as const,
		mode: 'all' as const,
		children: [],
	};
}

function normalizeGroupDefinitionPatch(
	group: ChartGroupDefinition,
	patch: Partial<ChartGroup>,
): ChartGroupDefinition {
	return {
		...group,
		...(typeof patch.name === 'string' && patch.name.trim()
			? { name: patch.name.trim() }
			: {}),
		...(typeof patch.color === 'string' && patch.color.trim()
			? { color: patch.color.trim() }
			: {}),
		...(patch.mode === 'manual' || patch.mode === 'rule'
			? { mode: patch.mode }
			: {}),
		...(patch.shape === 'auto' ||
		patch.shape === 'circle' ||
		patch.shape === 'rectangle'
			? { shape: patch.shape }
			: {}),
		...(typeof patch.padding === 'number' && Number.isFinite(patch.padding)
			? { padding: Math.max(0, patch.padding) }
			: {}),
		...(patch.rule !== undefined ? { rule: patch.rule } : {}),
	};
}

function createDefaultGroupFrame(index: number): GroupFrame {
	return {
		x: -1.6 + (index % 3) * 3.8,
		y: -1.1 - Math.floor(index / 3) * 2.8,
		width: 3.2,
		height: 2.2,
	};
}

function getActiveChart(state: WorkspaceState): MetaGraphChart {
	const chart = state.charts.find((item) => item.id === state.activeChartId);
	if (!chart) {
		throw new Error('Active chart is missing from workspace state.');
	}
	return chart;
}
