import type {
	ChartLayoutConfig,
	LayoutNodeSort,
	LayoutSortDirection,
	ManualLayoutConfig,
	ViewMode,
} from '../../core/types';
import { cloneSerializable } from '../state/persistence';
import {
	DEFAULT_GRAPH_CENTER_FORCE,
	DEFAULT_GRAPH_DRAG_LINK_FORCE,
	DEFAULT_GRAPH_LINK_DISTANCE,
	DEFAULT_GRAPH_LINK_FORCE,
	DEFAULT_GRAPH_REPEL_FORCE,
	DEFAULT_GRAPH_RETURN_FORCE,
} from './constants';
import { normalizeFilterGroup } from './query';
import {
	createDockId,
	isRecord,
	normalizeTextPath,
	readFiniteNumber,
	readOptionalFiniteNumber,
	uniqueById,
} from './utils';

export function normalizeLayout(
	value: unknown,
	fallback: ChartLayoutConfig,
	type: ViewMode,
): ChartLayoutConfig {
	const record = isRecord(value) ? value : {};
	const spacing = readFiniteNumber(record.spacing, fallback.spacing);
	return {
		engine: readLayoutEngine(type),
		spacing,
		layerSpacing: readFiniteNumber(
			record.layerSpacing,
			fallback.layerSpacing ?? spacing,
		),
		laneSpacing: readFiniteNumber(
			record.laneSpacing,
			fallback.laneSpacing ?? spacing,
		),
		centerForce: normalizeForceSetting(
			record.centerForce,
			fallback.centerForce ?? DEFAULT_GRAPH_CENTER_FORCE,
		),
		repelForce: normalizeForceSetting(
			record.repelForce,
			fallback.repelForce ?? DEFAULT_GRAPH_REPEL_FORCE,
		),
		linkForce: normalizeForceSetting(
			record.linkForce,
			fallback.linkForce ?? DEFAULT_GRAPH_LINK_FORCE,
		),
		dragLinkForce: normalizeForceSetting(
			record.dragLinkForce,
			fallback.dragLinkForce ?? DEFAULT_GRAPH_DRAG_LINK_FORCE,
		),
		returnForce: normalizeForceSetting(
			record.returnForce,
			fallback.returnForce ?? DEFAULT_GRAPH_RETURN_FORCE,
		),
		linkDistance: normalizeForceSetting(
			record.linkDistance,
			fallback.linkDistance ?? DEFAULT_GRAPH_LINK_DISTANCE,
		),
		direction:
			record.direction === 'RL' ||
			record.direction === 'TD' ||
			record.direction === 'DT'
				? record.direction
				: fallback.direction,
		arcDirection:
			record.arcDirection === 'right' ||
			record.arcDirection === 'left' ||
			record.arcDirection === 'up' ||
			record.arcDirection === 'down'
				? record.arcDirection
				: fallback.arcDirection,
		nodeSort: readLayoutNodeSort(record.nodeSort, fallback.nodeSort),
		nodeSortDirection: readLayoutSortDirection(
			record.nodeSortDirection,
			fallback.nodeSortDirection,
		),
		edgeStyle:
			record.edgeStyle === 'straight' || record.edgeStyle === 'orthogonal'
				? record.edgeStyle
				: fallback.edgeStyle,
		manual: normalizeManualLayout(record.manual, fallback.manual),
	};
}

export function createDefaultLayout(type: ViewMode): ChartLayoutConfig {
	switch (type) {
		case 'flow':
			return {
				engine: 'elk',
				spacing: 1,
				layerSpacing: 1,
				laneSpacing: 1,
				direction: 'LR',
				edgeStyle: 'orthogonal',
			};
		case 'arc':
			return {
				engine: 'arc',
				spacing: 1,
				arcDirection: 'right',
				nodeSort: 'name',
				nodeSortDirection: 'asc',
			};
		case 'hierarchical-edge-bundling':
			return {
				engine: 'hierarchical-edge-bundling',
				spacing: 1,
				nodeSort: 'path',
				nodeSortDirection: 'asc',
			};
		case 'graph-3d':
			return {
				engine: 'force-3d',
				spacing: 1,
				centerForce: DEFAULT_GRAPH_CENTER_FORCE,
				repelForce: DEFAULT_GRAPH_REPEL_FORCE,
				linkForce: DEFAULT_GRAPH_LINK_FORCE,
				dragLinkForce: DEFAULT_GRAPH_DRAG_LINK_FORCE,
				returnForce: DEFAULT_GRAPH_RETURN_FORCE,
				linkDistance: DEFAULT_GRAPH_LINK_DISTANCE,
			};
		case 'cube':
			return {
				engine: 'cube-3d',
				spacing: 1,
				centerForce: DEFAULT_GRAPH_CENTER_FORCE,
				repelForce: DEFAULT_GRAPH_REPEL_FORCE,
				linkForce: DEFAULT_GRAPH_LINK_FORCE,
				dragLinkForce: DEFAULT_GRAPH_DRAG_LINK_FORCE,
				returnForce: DEFAULT_GRAPH_RETURN_FORCE,
				linkDistance: DEFAULT_GRAPH_LINK_DISTANCE,
				manual: {
					nodes: {},
					groups: createDefaultCubeGroups(),
				},
			};
		case 'free':
			return {
				engine: 'free',
				spacing: 1,
				manual: {
					nodes: {},
					groups: [],
				},
			};
		case 'graph':
			return {
				engine: 'force-atlas',
				spacing: 1,
				centerForce: DEFAULT_GRAPH_CENTER_FORCE,
				repelForce: DEFAULT_GRAPH_REPEL_FORCE,
				linkForce: DEFAULT_GRAPH_LINK_FORCE,
				dragLinkForce: DEFAULT_GRAPH_DRAG_LINK_FORCE,
				returnForce: DEFAULT_GRAPH_RETURN_FORCE,
				linkDistance: DEFAULT_GRAPH_LINK_DISTANCE,
			};
	}
}

function readLayoutNodeSort(
	value: unknown,
	fallback: LayoutNodeSort | undefined,
): LayoutNodeSort {
	return value === 'path' ||
		value === 'folder' ||
		value === 'type' ||
		value === 'tag' ||
		value === 'domain' ||
		value === 'created' ||
		value === 'modified' ||
		value === 'degree' ||
		value === 'in-degree' ||
		value === 'out-degree' ||
		value === 'name'
		? value
		: (fallback ?? 'name');
}

function readLayoutSortDirection(
	value: unknown,
	fallback: LayoutSortDirection | undefined,
): LayoutSortDirection {
	return value === 'desc' || value === 'asc' ? value : (fallback ?? 'asc');
}

function normalizeForceSetting(value: unknown, fallback: number): number {
	const normalized = readFiniteNumber(value, fallback);
	return normalized >= 0 ? normalized : fallback;
}

function normalizeManualLayout(
	value: unknown,
	fallback?: ManualLayoutConfig,
): ManualLayoutConfig {
	const record = isRecord(value) ? value : {};
	const nodeRecord = isRecord(record.nodes) ? record.nodes : {};
	const nodes: ManualLayoutConfig['nodes'] = {};
	for (const [path, placementValue] of Object.entries(nodeRecord)) {
		const placement = normalizeNodePlacement(placementValue);
		if (placement) {
			nodes[normalizeTextPath(path)] = placement;
		}
	}
	const groups = Array.isArray(record.groups)
		? record.groups
				.map((group, index) => normalizeChartGroup(group, index))
				.filter(
					(group): group is ManualLayoutConfig['groups'][number] =>
						Boolean(group),
				)
		: [];
	return {
		nodes:
			Object.keys(nodes).length > 0
				? nodes
				: cloneSerializable(fallback?.nodes ?? {}),
		groups:
			groups.length > 0
				? uniqueById(groups)
				: cloneSerializable(fallback?.groups ?? []),
	};
}

function normalizeNodePlacement(
	value: unknown,
): ManualLayoutConfig['nodes'][string] | undefined {
	const record = isRecord(value) ? value : {};
	const x = readOptionalFiniteNumber(record.x);
	const y = readOptionalFiniteNumber(record.y);
	if (x === undefined || y === undefined) {
		return undefined;
	}
	const groupId =
		typeof record.groupId === 'string' && record.groupId.trim()
			? record.groupId.trim()
			: undefined;
	return groupId ? { x, y, groupId } : { x, y };
}

function normalizeChartGroup(
	value: unknown,
	index: number,
): ManualLayoutConfig['groups'][number] | undefined {
	const record = isRecord(value) ? value : {};
	const id =
		typeof record.id === 'string' && record.id.trim()
			? record.id.trim()
			: createDockId('group', `${index + 1}`);
	const name =
		typeof record.name === 'string' && record.name.trim()
			? record.name.trim()
			: `Group ${index + 1}`;
	const x = readFiniteNumber(record.x, 0);
	const y = readFiniteNumber(record.y, 0);
	const width = Math.max(0.8, normalizeGroupSize(record.width, 3.2));
	const height = Math.max(0.6, normalizeGroupSize(record.height, 2.2));
	const color =
		typeof record.color === 'string' && record.color.trim()
			? record.color.trim()
			: '#7c6ff0';
	const mode = record.mode === 'rule' ? 'rule' : 'manual';
	const padding = Math.max(0, readFiniteNumber(record.padding, 0.32));
	return {
		id,
		name,
		x,
		y,
		width,
		height,
		color,
		mode,
		padding,
		rule: isRecord(record.rule)
			? normalizeFilterGroup(record.rule)
			: undefined,
	};
}

function normalizeGroupSize(value: unknown, fallback: number): number {
	const size = readFiniteNumber(value, fallback);
	return size > 20 ? size / 100 : size;
}

function createDefaultCubeGroups(): ManualLayoutConfig['groups'] {
	return [
		{
			id: 'cube-front',
			name: 'Front',
			x: -1,
			y: -1,
			width: 2,
			height: 2,
			color: '#009b48',
			mode: 'manual',
			padding: 0.22,
		},
		{
			id: 'cube-back',
			name: 'Back',
			x: -1,
			y: -1,
			width: 2,
			height: 2,
			color: '#0046ad',
			mode: 'manual',
			padding: 0.22,
		},
		{
			id: 'cube-left',
			name: 'Left',
			x: -1,
			y: -1,
			width: 2,
			height: 2,
			color: '#ff5800',
			mode: 'manual',
			padding: 0.22,
		},
		{
			id: 'cube-right',
			name: 'Right',
			x: -1,
			y: -1,
			width: 2,
			height: 2,
			color: '#b71234',
			mode: 'manual',
			padding: 0.22,
		},
		{
			id: 'cube-top',
			name: 'Top',
			x: -1,
			y: -1,
			width: 2,
			height: 2,
			color: '#ffffff',
			mode: 'manual',
			padding: 0.22,
		},
		{
			id: 'cube-bottom',
			name: 'Bottom',
			x: -1,
			y: -1,
			width: 2,
			height: 2,
			color: '#ffd500',
			mode: 'manual',
			padding: 0.22,
		},
	];
}

function readLayoutEngine(type: ViewMode): ChartLayoutConfig['engine'] {
	if (type === 'flow') {
		return 'elk';
	}
	if (type === 'arc') {
		return 'arc';
	}
	if (type === 'hierarchical-edge-bundling') {
		return 'hierarchical-edge-bundling';
	}
	if (type === 'graph-3d') {
		return 'force-3d';
	}
	if (type === 'cube') {
		return 'cube-3d';
	}
	if (type === 'free') {
		return 'free';
	}
	return 'force-atlas';
}
