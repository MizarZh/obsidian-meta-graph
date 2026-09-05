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
import { getCanonicalParallelLane } from '../../model/parallel-edges';
import type { PlanarEdgeRoute } from '../../../layouts/planar-geometry';
import {
	createG6EdgeStyle,
	createG6NodeStyle,
	resolveG6NodeType,
	type G6EdgeStyle,
	type G6LabelStyles,
	type G6NodeStyle,
	type G6NodeType,
	type G6VisualScale,
} from './g6-styles';
import type { G6CoordinateSpace } from './g6-coordinate-space';
import {
	G6_LOGICAL_EDGE_TYPE,
	type G6LogicalEdgeStyle,
} from './g6-logical-edge';

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
	type: G6EdgeType;
	data: G6EdgeMetadata;
	style: G6EdgeStyle;
}

export type G6EdgeType = 'line' | 'quadratic' | typeof G6_LOGICAL_EDGE_TYPE;

export interface G6GraphData extends GraphData {
	nodes: G6NodeData[];
	edges: G6EdgeData[];
}

export interface G6StylePatch {
	nodes: Array<
		Pick<G6NodeData, 'id' | 'style'> & Partial<Pick<G6NodeData, 'type'>>
	>;
	edges: Array<
		Pick<G6EdgeData, 'id' | 'style'> & Partial<Pick<G6EdgeData, 'type'>>
	>;
}

export interface G6LabelVisibilityOptions {
	labelDensity: number;
	forceLabels: boolean;
}

export interface G6LabelVisibility {
	nodeIds: ReadonlySet<string>;
	edgeIds: ReadonlySet<string>;
}

export function isG6RenderedNode(
	attributes: RuntimeNodeAttributes,
	edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>,
): boolean {
	return !edgeRoutes?.size || !attributes.isBend;
}

export function toG6Data(
	graph: RuntimeGraph,
	visualScale?: G6VisualScale,
	labelVisibility?: G6LabelVisibility,
	labelStyles?: G6LabelStyles,
	coordinateSpace?: G6CoordinateSpace,
	edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>,
): G6GraphData {
	const routed = edgeRoutes && edgeRoutes.size > 0 ? edgeRoutes : undefined;
	return {
		nodes: graph.nodes().flatMap((nodeId) => {
			const attributes = graph.getNodeAttributes(nodeId);
			if (!isG6RenderedNode(attributes, routed)) return [];
			return [
				toG6NodeData(
					nodeId,
					attributes,
					visualScale,
					labelVisibility?.nodeIds.has(nodeId),
					labelStyles?.node,
					coordinateSpace,
				),
			];
		}),
		edges: routed
			? createG6RoutedEdges(
					graph,
					routed,
					visualScale,
					labelVisibility,
					labelStyles,
					coordinateSpace,
				)
			: graph.mapEdges((edgeId, attributes, source, target) =>
					toG6EdgeData(
						edgeId,
						source,
						target,
						attributes,
						graph.isDirected(edgeId),
						visualScale,
						labelVisibility?.edgeIds.has(edgeId),
						labelStyles?.edge,
					),
				),
	};
}

export function createG6StylePatch(
	graph: RuntimeGraph,
	changes: { nodeIds: readonly string[]; edgeIds: readonly string[] },
	visualScale?: G6VisualScale,
	labelVisibility?: G6LabelVisibility,
	labelStyles?: G6LabelStyles,
	coordinateSpace?: G6CoordinateSpace,
	edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>,
): G6StylePatch {
	const routedLogicalIds = new Set<string>();
	return {
		nodes: changes.nodeIds.flatMap((nodeId) => {
			if (!graph.hasNode(nodeId)) return [];
			const attributes = graph.getNodeAttributes(nodeId);
			if (!isG6RenderedNode(attributes, edgeRoutes)) return [];
			return [
				{
					id: nodeId,
					type: resolveG6NodeType(attributes.type),
					style: createG6MappedNodeStyle(
						attributes,
						visualScale,
						labelVisibility?.nodeIds.has(nodeId),
						labelStyles?.node,
						coordinateSpace,
					),
				},
			];
		}),
		edges: changes.edgeIds.flatMap((edgeId) => {
			if (!graph.hasEdge(edgeId)) {
				const route = edgeRoutes?.get(edgeId);
				if (!route || routedLogicalIds.has(edgeId)) return [];
				routedLogicalIds.add(edgeId);
				const routedEdge = toG6RouteEdgeData(
					graph,
					route,
					visualScale,
					labelVisibility,
					labelStyles,
					coordinateSpace,
				);
				return routedEdge
					? [
							{
								id: routedEdge.id,
								type: routedEdge.type,
								style: routedEdge.style,
							},
						]
					: [];
			}
			const attributes = graph.getEdgeAttributes(edgeId);
			const logicalEdgeId = attributes.logicalEdgeId ?? edgeId;
			const route = edgeRoutes?.get(logicalEdgeId);
			if (route) {
				if (routedLogicalIds.has(logicalEdgeId)) return [];
				routedLogicalIds.add(logicalEdgeId);
				const routedEdge = toG6RouteEdgeData(
					graph,
					route,
					visualScale,
					labelVisibility,
					labelStyles,
					coordinateSpace,
				);
				return routedEdge
					? [
							{
								id: routedEdge.id,
								type: routedEdge.type,
								style: routedEdge.style,
							},
						]
					: [];
			}
			const source = graph.source(edgeId);
			const target = graph.target(edgeId);
			return [
				{
					id: edgeId,
					type: resolveG6EdgeType(attributes, source, target),
					style: {
						...createG6EdgeStyle(
							attributes,
							graph.isDirected(edgeId),
							visualScale,
							labelVisibility?.edgeIds.has(edgeId),
							labelStyles?.edge,
						),
						...resolveG6ParallelEdgeStyle(
							attributes,
							source,
							target,
							visualScale,
						),
					},
				},
			];
		}),
	};
}

export function createG6LabelStylePatch(
	graph: RuntimeGraph,
	visualScale: G6VisualScale,
	labelVisibility: G6LabelVisibility,
	labelStyles: G6LabelStyles,
	edgeRoutes?: ReadonlyMap<string, PlanarEdgeRoute>,
): G6StylePatch {
	const routedLogicalIds = new Set<string>();
	return {
		nodes: graph.nodes().flatMap((nodeId) => {
			const attributes = graph.getNodeAttributes(nodeId);
			if (!isG6RenderedNode(attributes, edgeRoutes)) return [];
			if (!attributes.label) return [];
			const hidden = Boolean(attributes.hidden);
			return [
				{
					id: nodeId,
					style: {
						...labelStyles.node,
						label: !hidden && labelVisibility.nodeIds.has(nodeId),
						labelText: attributes.label,
					},
				},
			];
		}),
		edges: graph.edges().flatMap((edgeId) => {
			const attributes = graph.getEdgeAttributes(edgeId);
			if (!attributes.label) return [];
			const logicalEdgeId = attributes.logicalEdgeId ?? edgeId;
			if (edgeRoutes?.has(logicalEdgeId)) {
				if (routedLogicalIds.has(logicalEdgeId)) return [];
				routedLogicalIds.add(logicalEdgeId);
				return [
					{
						id: logicalEdgeId,
						style: {
							...labelStyles.edge,
							label:
								!attributes.hidden &&
								labelVisibility.edgeIds.has(edgeId),
							labelText: attributes.label,
							labelOpacity: normalizeOpacity(attributes.opacity),
						},
					},
				];
			}
			return [
				{
					id: edgeId,
					style: {
						...labelStyles.edge,
						label:
							!attributes.hidden &&
							labelVisibility.edgeIds.has(edgeId),
						labelText: attributes.label,
						labelOpacity: normalizeOpacity(attributes.opacity),
					},
				},
			];
		}),
	};
}

function createG6RoutedEdges(
	graph: RuntimeGraph,
	edgeRoutes: ReadonlyMap<string, PlanarEdgeRoute>,
	visualScale?: G6VisualScale,
	labelVisibility?: G6LabelVisibility,
	labelStyles?: G6LabelStyles,
	coordinateSpace?: G6CoordinateSpace,
): G6EdgeData[] {
	const routedIds = new Set(edgeRoutes.keys());
	const ordinaryEdges = graph
		.mapEdges((edgeId, attributes, source, target) => ({
			edgeId,
			attributes,
			source,
			target,
		}))
		.filter(
			({ edgeId, attributes }) =>
				!routedIds.has(attributes.logicalEdgeId ?? edgeId),
		)
		.map(({ edgeId, attributes, source, target }) =>
			toG6EdgeData(
				edgeId,
				source,
				target,
				attributes,
				graph.isDirected(edgeId),
				visualScale,
				labelVisibility?.edgeIds.has(edgeId),
				labelStyles?.edge,
			),
		);
	const logicalEdges = [...edgeRoutes.values()].flatMap((route) => {
		const edge = toG6RouteEdgeData(
			graph,
			route,
			visualScale,
			labelVisibility,
			labelStyles,
			coordinateSpace,
		);
		return edge ? [edge] : [];
	});
	return [...ordinaryEdges, ...logicalEdges];
}

function toG6RouteEdgeData(
	graph: RuntimeGraph,
	route: PlanarEdgeRoute,
	visualScale?: G6VisualScale,
	labelVisibility?: G6LabelVisibility,
	labelStyles?: G6LabelStyles,
	coordinateSpace?: G6CoordinateSpace,
): G6EdgeData | undefined {
	const runtimeEdgeIds = graph.edges().filter((edgeId) => {
		const attributes = graph.getEdgeAttributes(edgeId);
		return (attributes.logicalEdgeId ?? edgeId) === route.id;
	});
	const firstEdgeId = runtimeEdgeIds[0];
	if (!firstEdgeId) return undefined;
	const labelEdgeId = runtimeEdgeIds.find((edgeId) =>
		Boolean(graph.getEdgeAttribute(edgeId, 'label')),
	);
	const attributes = {
		...graph.getEdgeAttributes(firstEdgeId),
		...(labelEdgeId ? graph.getEdgeAttributes(labelEdgeId) : {}),
	};
	const directed = runtimeEdgeIds.some((edgeId) => graph.isDirected(edgeId));
	const style = createG6EdgeStyle(
		attributes,
		directed,
		visualScale,
		labelEdgeId ? labelVisibility?.edgeIds.has(labelEdgeId) : false,
		labelStyles?.edge,
	) as G6LogicalEdgeStyle;
	const mapPoint = (point: { x: number; y: number }) =>
		coordinateSpace?.toG6(point) ?? point;
	style.controlPoints = route.commands
		.slice(0, -1)
		.map((command) => mapPoint(command.to))
		.map((point) => [point.x, point.y]);
	style.radius = 0;
	if (route.label) {
		style.labelPlacement = resolveRouteLabelPlacement(route);
		style.labelAutoRotate = true;
	}
	return {
		id: route.id,
		source: route.source,
		target: route.target,
		type: G6_LOGICAL_EDGE_TYPE,
		data: {
			relation: attributes.relation,
			sourcePath: attributes.sourcePath,
			sourceField: attributes.sourceField,
			kind: attributes.kind,
			semantic: attributes.semantic !== false,
			directed,
			logicalEdgeId: route.id,
			logicalSource: route.source,
			logicalTarget: route.target,
			arrowStyle: attributes.arrowStyle ?? 'filled',
			parallelGroupKey: attributes.parallelGroupKey,
			parallelLane: attributes.parallelLane ?? 0,
			parallelCount: attributes.parallelCount ?? 1,
			parallelDirection: attributes.parallelDirection ?? 1,
		},
		style,
	};
}

export function resolveRouteLabelPlacement(route: PlanarEdgeRoute): number {
	const points = [
		route.start,
		...route.commands.map((command) => command.to),
	];
	const label = route.label?.position;
	if (!label || points.length < 2) return 0.5;
	const lengths = points
		.slice(1)
		.map((point, index) =>
			Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
		);
	const total = lengths.reduce((sum, length) => sum + length, 0);
	if (total <= 0.001) return 0.5;
	let traversed = 0;
	let bestDistance = Number.POSITIVE_INFINITY;
	let bestOffset = total / 2;
	for (const [index, length] of lengths.entries()) {
		const start = points[index]!;
		const end = points[index + 1]!;
		if (length <= 0.001) continue;
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const ratio = Math.min(
			1,
			Math.max(
				0,
				((label.x - start.x) * dx + (label.y - start.y) * dy) /
					(length * length),
			),
		);
		const x = start.x + dx * ratio;
		const y = start.y + dy * ratio;
		const distance = (label.x - x) ** 2 + (label.y - y) ** 2;
		if (distance < bestDistance) {
			bestDistance = distance;
			bestOffset = traversed + length * ratio;
		}
		traversed += length;
	}
	return Math.min(1, Math.max(0, bestOffset / total));
}

export function resolveG6EdgeType(
	attributes: RuntimeEdgeAttributes,
	source: string,
	target: string,
): G6EdgeType {
	return source === target || (attributes.parallelCount ?? 1) > 1
		? 'quadratic'
		: 'line';
}

export function resolveG6ParallelEdgeStyle(
	attributes: RuntimeEdgeAttributes,
	source: string,
	target: string,
	visualScale?: G6VisualScale,
): G6EdgeStyle {
	const geometryScale = visualScale?.geometry ?? 1;
	if (source === target) {
		const count = Math.max(1, attributes.parallelCount ?? 1);
		const lane = attributes.parallelLane ?? 0;
		const index = Math.max(0, Math.min(count - 1, lane + (count - 1) / 2));
		return {
			loopPlacement: 'top',
			loopDist: (35 + index * 15) * geometryScale,
		};
	}
	if ((attributes.parallelCount ?? 1) <= 1) return {};
	return {
		curveOffset: getCanonicalParallelLane(attributes) * 30 * geometryScale,
	};
}

/** Chooses a stable, monotonic label budget without a collision pass. */
export function resolveG6LabelVisibility(
	graph: RuntimeGraph,
	options: G6LabelVisibilityOptions,
): G6LabelVisibility {
	const density = Math.min(1, Math.max(0, finiteOr(options.labelDensity, 1)));
	const candidates = graph
		.mapNodes((nodeId, attributes) => ({
			id: nodeId,
			attributes,
			degree: graph.degree(nodeId),
		}))
		.filter(
			({ attributes }) =>
				!attributes.hidden &&
				!attributes.isBend &&
				Boolean(attributes.label),
		)
		.sort((left, right) => {
			if (
				Boolean(left.attributes.isPrimary) !==
				Boolean(right.attributes.isPrimary)
			) {
				return left.attributes.isPrimary ? -1 : 1;
			}
			if (left.attributes.size !== right.attributes.size) {
				return right.attributes.size - left.attributes.size;
			}
			if (left.degree !== right.degree) return right.degree - left.degree;
			return left.id.localeCompare(right.id);
		});
	const nodeBudget = options.forceLabels
		? candidates.length
		: Math.ceil(candidates.length * density);
	const nodeIds = new Set(
		candidates.slice(0, nodeBudget).map(({ id }) => id),
	);
	const edgeIds = new Set<string>();
	graph.forEachEdge((edgeId, attributes) => {
		if (
			!attributes.hidden &&
			Boolean(attributes.label) &&
			(options.forceLabels || attributes.forceLabel)
		) {
			edgeIds.add(edgeId);
		}
	});
	return { nodeIds, edgeIds };
}

function toG6NodeData(
	nodeId: string,
	attributes: RuntimeNodeAttributes,
	visualScale?: G6VisualScale,
	labelVisible?: boolean,
	labelStyle?: G6NodeStyle,
	coordinateSpace?: G6CoordinateSpace,
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
		style: createG6MappedNodeStyle(
			attributes,
			visualScale,
			labelVisible,
			labelStyle,
			coordinateSpace,
		),
	};
}

function createG6MappedNodeStyle(
	attributes: RuntimeNodeAttributes,
	visualScale?: G6VisualScale,
	labelVisible?: boolean,
	labelStyle?: G6NodeStyle,
	coordinateSpace?: G6CoordinateSpace,
): G6NodeStyle {
	const style = createG6NodeStyle(
		attributes,
		visualScale,
		labelVisible,
		labelStyle,
	);
	if (!coordinateSpace) return style;
	const position = coordinateSpace.toG6({
		x: attributes.x,
		y: attributes.y,
	});
	return { ...style, x: position.x, y: position.y };
}

function toG6EdgeData(
	edgeId: string,
	source: string,
	target: string,
	attributes: RuntimeEdgeAttributes,
	directed: boolean,
	visualScale?: G6VisualScale,
	labelVisible?: boolean,
	labelStyle?: G6EdgeStyle,
): G6EdgeData {
	return {
		id: edgeId,
		source,
		target,
		type: resolveG6EdgeType(attributes, source, target),
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
		style: {
			...createG6EdgeStyle(
				attributes,
				directed,
				visualScale,
				labelVisible,
				labelStyle,
			),
			...resolveG6ParallelEdgeStyle(
				attributes,
				source,
				target,
				visualScale,
			),
		},
	};
}

function normalizeOpacity(value: number | undefined): number {
	const opacity =
		typeof value === 'number' && Number.isFinite(value) ? value : 1;
	return Math.min(1, Math.max(0, opacity));
}

function finiteOr(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? value
		: fallback;
}
