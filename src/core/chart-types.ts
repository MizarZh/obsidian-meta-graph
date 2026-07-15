import type { ViewMode } from './types';

export interface ChartTypeDefinition {
	name: string;
	description: string;
}

export const CHART_TYPE_DEFINITIONS: Record<ViewMode, ChartTypeDefinition> = {
	graph: { name: 'Graph', description: 'Force-directed graph' },
	'graph-3d': { name: '3D graph', description: '3D force-directed graph' },
	cube: { name: 'Cube', description: 'Cube graph' },
	free: { name: 'Free', description: 'Free layout' },
	flow: { name: 'Flow', description: 'Flow diagram' },
	arc: { name: 'Arc', description: 'Arc diagram' },
	'hierarchical-edge-bundling': {
		name: 'HEB',
		description: 'Hierarchical edge bundling',
	},
};

export const CHART_TYPE_ORDER: readonly ViewMode[] = [
	'graph',
	'graph-3d',
	'cube',
	'free',
	'flow',
	'arc',
	'hierarchical-edge-bundling',
];

export function getChartTypeName(type: ViewMode): string {
	return CHART_TYPE_DEFINITIONS[type].name;
}
