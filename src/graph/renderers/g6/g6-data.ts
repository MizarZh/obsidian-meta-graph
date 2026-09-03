import type { EdgeData, GraphData, NodeData } from '@antv/g6';
import type {
	KnowledgeEdgeKind,
	KnowledgeNodeKind,
	LinkArrowStyle,
	RelationType,
} from '../../../core/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeGraph,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import {
	createG6EdgeStyle,
	createG6NodeStyle,
	resolveG6NodeType,
	type G6EdgeStyle,
	type G6NodeStyle,
	type G6NodeType,
} from './g6-styles';

export interface G6NodeMetadata extends Record<string, unknown> {
	path: string;
	folder: string;
	kind?: KnowledgeNodeKind;
	domains: string[];
	tags: string[];
	noteType?: string;
	isPrimary: boolean;
	isContext: boolean;
	fixed: boolean;
	isBend: boolean;
}

export interface G6EdgeMetadata extends Record<string, unknown> {
	relation: RelationType;
	sourcePath?: string;
	sourceField?: string;
	kind?: KnowledgeEdgeKind;
	semantic: boolean;
	directed: boolean;
	logicalEdgeId: string;
	logicalSource: string;
	logicalTarget: string;
	arrowStyle: LinkArrowStyle;
	parallelGroupKey?: string;
	parallelLane: number;
	parallelCount: number;
	parallelDirection: 1 | -1;
}

export interface G6NodeData extends NodeData {
	type: G6NodeType;
	data: G6NodeMetadata;
	style: G6NodeStyle;
}

export interface G6EdgeData extends EdgeData {
	id: string;
	type: 'line';
	data: G6EdgeMetadata;
	style: G6EdgeStyle;
}

export interface G6GraphData extends GraphData {
	nodes: G6NodeData[];
	edges: G6EdgeData[];
}

export interface G6StylePatch {
	nodes: Array<Pick<G6NodeData, 'id' | 'type' | 'style'>>;
	edges: Array<Pick<G6EdgeData, 'id' | 'type' | 'style'>>;
}

export function toG6Data(graph: RuntimeGraph): G6GraphData {
	return {
		nodes: graph.mapNodes((nodeId, attributes) =>
			toG6NodeData(nodeId, attributes),
		),
		edges: graph.mapEdges((edgeId, attributes, source, target) =>
			toG6EdgeData(
				edgeId,
				source,
				target,
				attributes,
				graph.isDirected(edgeId),
			),
		),
	};
}

export function createG6StylePatch(
	graph: RuntimeGraph,
	changes: { nodeIds: readonly string[]; edgeIds: readonly string[] },
): G6StylePatch {
	return {
		nodes: changes.nodeIds.flatMap((nodeId) => {
			if (!graph.hasNode(nodeId)) return [];
			const attributes = graph.getNodeAttributes(nodeId);
			return [
				{
					id: nodeId,
					type: resolveG6NodeType(attributes.type),
					style: createG6NodeStyle(attributes),
				},
			];
		}),
		edges: changes.edgeIds.flatMap((edgeId) => {
			if (!graph.hasEdge(edgeId)) return [];
			const attributes = graph.getEdgeAttributes(edgeId);
			return [
				{
					id: edgeId,
					type: 'line' as const,
					style: createG6EdgeStyle(
						attributes,
						graph.isDirected(edgeId),
					),
				},
			];
		}),
	};
}

function toG6NodeData(
	nodeId: string,
	attributes: RuntimeNodeAttributes,
): G6NodeData {
	return {
		id: nodeId,
		type: resolveG6NodeType(attributes.type),
		data: {
			path: attributes.path,
			folder: attributes.folder,
			kind: attributes.kind,
			domains: [...attributes.domains],
			tags: [...attributes.tags],
			noteType: attributes.noteType,
			isPrimary: Boolean(attributes.isPrimary),
			isContext: Boolean(attributes.isContext),
			fixed: Boolean(attributes.fixed),
			isBend: Boolean(attributes.isBend),
		},
		style: createG6NodeStyle(attributes),
	};
}

function toG6EdgeData(
	edgeId: string,
	source: string,
	target: string,
	attributes: RuntimeEdgeAttributes,
	directed: boolean,
): G6EdgeData {
	return {
		id: edgeId,
		source,
		target,
		type: 'line',
		data: {
			relation: attributes.relation,
			sourcePath: attributes.sourcePath,
			sourceField: attributes.sourceField,
			kind: attributes.kind,
			semantic: attributes.semantic !== false,
			directed,
			logicalEdgeId: attributes.logicalEdgeId ?? edgeId,
			logicalSource: attributes.logicalSource ?? source,
			logicalTarget: attributes.logicalTarget ?? target,
			arrowStyle: attributes.arrowStyle ?? 'filled',
			parallelGroupKey: attributes.parallelGroupKey,
			parallelLane: attributes.parallelLane ?? 0,
			parallelCount: attributes.parallelCount ?? 1,
			parallelDirection: attributes.parallelDirection ?? 1,
		},
		style: createG6EdgeStyle(attributes, directed),
	};
}
