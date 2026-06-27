import type {
	MetaGraphDocument,
	WorkspaceState,
} from '../core/types';
import { cloneSerializable } from './workspace-persistence';
import { createDefaultMetaGraphDocument } from './meta-graph-model';

export function createWorkspaceState(
	maxNodes: number,
	fadeDistance = 1.5,
	document?: MetaGraphDocument,
): WorkspaceState {
	const metaGraphDocument =
		document ?? createDefaultMetaGraphDocument(maxNodes, fadeDistance);
	const activeChart =
		metaGraphDocument.charts.find(
			(chart) => chart.id === metaGraphDocument.activeChart,
		) ?? metaGraphDocument.charts[0];
	if (!activeChart) {
		return createWorkspaceState(
			maxNodes,
			fadeDistance,
			createDefaultMetaGraphDocument(maxNodes, fadeDistance),
		);
	}
	const state: WorkspaceState = {
		charts: cloneSerializable(metaGraphDocument.charts),
		activeChartId: activeChart.id,
		mode: activeChart.type,
		chartSource: activeChart.source,
		flowEdgeStyle: activeChart.layout.edgeStyle ?? 'orthogonal',
		flowDirection: activeChart.layout.direction ?? 'LR',
		arcDirection: activeChart.layout.arcDirection ?? 'right',
		fadeDistance: activeChart.display.fadeDistance,
		labelSize: activeChart.display.labelSize,
			labelPosition: activeChart.display.labelPosition,
				labelColor: activeChart.display.labelColor,
				labelBackgroundOpacity: activeChart.display.labelBackgroundOpacity,
				labelDensity: activeChart.display.labelDensity,
				forceLabels: activeChart.display.forceLabels,
				enableForceLayout: activeChart.display.enableForceLayout,
			graphSpacing:
			activeChart.type === 'graph' ? activeChart.layout.spacing : 1,
		flowSpacing:
			activeChart.type === 'flow' ? activeChart.layout.spacing : 1,
		arcSpacing: activeChart.type === 'arc' ? activeChart.layout.spacing : 1,
		layoutRevision: 0,
		query: cloneSerializable(activeChart.query),
		curated: cloneSerializable(activeChart.curated),
		globalQuery: cloneSerializable(metaGraphDocument.globalQuery),
		globalNodeStyleRules: cloneSerializable(
			metaGraphDocument.globalStyle.nodeRules,
		),
		globalLinkStyleRules: cloneSerializable(
			metaGraphDocument.globalStyle.linkRules,
		),
		nodeStyleRules: cloneSerializable(activeChart.style.nodeRules),
		linkStyleRules: cloneSerializable(activeChart.style.linkRules),
		connectionFields: cloneSerializable(metaGraphDocument.connectionFields),
		activeConnectionField: metaGraphDocument.activeConnectionField,
		connectionUndoCount: 0,
		dock: cloneSerializable(metaGraphDocument.dock),
		availableFolders: [],
		availableTags: [],
		availableDomains: [],
	};
	return state;
}
