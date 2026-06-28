import type {
	MetaGraphDocument,
	WorkspaceState,
} from '../core/types';
import { cloneSerializable } from './workspace-persistence';
import {
	DEFAULT_GRAPH_CENTER_FORCE,
	DEFAULT_GRAPH_DRAG_LINK_FORCE,
	DEFAULT_GRAPH_LINK_DISTANCE,
	DEFAULT_GRAPH_LINK_FORCE,
	DEFAULT_GRAPH_REPEL_FORCE,
	DEFAULT_GRAPH_RETURN_FORCE,
	createDefaultMetaGraphDocument,
} from './meta-graph-model';

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
					cubeFaceOpacity: activeChart.display.cubeFaceOpacity,
					forceLabels: activeChart.display.forceLabels,
				enableForceLayout: activeChart.display.enableForceLayout,
			graphSpacing:
					activeChart.type === 'graph' ||
					activeChart.type === 'graph-3d' ||
					activeChart.type === 'cube'
				? activeChart.layout.spacing
				: 1,
			graphCenterForce:
				activeChart.layout.centerForce ?? DEFAULT_GRAPH_CENTER_FORCE,
			graphRepelForce:
				activeChart.layout.repelForce ?? DEFAULT_GRAPH_REPEL_FORCE,
			graphLinkForce: activeChart.layout.linkForce ?? DEFAULT_GRAPH_LINK_FORCE,
			graphDragLinkForce:
				activeChart.layout.dragLinkForce ?? DEFAULT_GRAPH_DRAG_LINK_FORCE,
			graphReturnForce:
				activeChart.layout.returnForce ?? DEFAULT_GRAPH_RETURN_FORCE,
			graphLinkDistance:
				activeChart.layout.linkDistance ?? DEFAULT_GRAPH_LINK_DISTANCE,
			flowSpacing:
				activeChart.type === 'flow' ? activeChart.layout.spacing : 1,
			arcSpacing: activeChart.type === 'arc' ? activeChart.layout.spacing : 1,
			manualLayout: cloneSerializable(
				activeChart.layout.manual ?? { nodes: {}, groups: [] },
			),
			layoutRevision: 0,
		query: cloneSerializable(activeChart.query),
		curated: cloneSerializable(activeChart.curated),
			globalQuery: cloneSerializable(metaGraphDocument.globalQuery),
			defaultNodeStyle: cloneSerializable(
				metaGraphDocument.globalStyle.defaultNodeStyle,
			),
			defaultLinkStyle: cloneSerializable(
				metaGraphDocument.globalStyle.defaultLinkStyle,
			),
			globalNodeStyleRules: cloneSerializable(
				metaGraphDocument.globalStyle.nodeRules,
			),
			globalLinkStyleRules: cloneSerializable(
				metaGraphDocument.globalStyle.linkRules,
			),
			nodeStyleOverrides: cloneSerializable(activeChart.style.nodeOverrides),
			linkStyleOverrides: cloneSerializable(activeChart.style.linkOverrides),
			nodeStyleRules: cloneSerializable(activeChart.style.nodeRules),
			linkStyleRules: cloneSerializable(activeChart.style.linkRules),
		connectionFields: cloneSerializable(metaGraphDocument.connectionFields),
		connectionFieldSpecs: cloneSerializable(
			metaGraphDocument.connectionFieldSpecs,
		),
		connectionFieldModes: cloneSerializable(
			metaGraphDocument.connectionFieldModes,
		),
		activeConnectionFieldSpecId:
			metaGraphDocument.activeConnectionFieldSpecId,
		activeConnectionField: metaGraphDocument.activeConnectionField,
		connectionUndoCount: 0,
		dock: cloneSerializable(metaGraphDocument.dock),
		availableFolders: [],
		availableTags: [],
		availableDomains: [],
	};
	return state;
}
