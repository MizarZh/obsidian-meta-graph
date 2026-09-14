import type { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';

/** Automatic ELK geometry only. Never populated from renderer/drag coordinates. */
export interface FlowInteractiveHistory {
	key: string;
	inputKey?: string;
	geometry: ElkNode;
}

/** Canonical layout input only: no prior geometry, dragging or view state. */
export function flowLayoutInputKey(root: ElkNode): string {
	const canonical = (node: ElkNode): ElkNode => ({
		...node,
		children: node.children
			?.map(canonical)
			.sort((a, b) => compare(a.id, b.id)),
		edges: node.edges
			? [...node.edges].sort((a, b) => compare(a.id, b.id))
			: undefined,
	});
	return JSON.stringify(canonical(root));
}

const MODEL_ORDER = {
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
	'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
	'elk.layered.considerModelOrder.components': 'MODEL_ORDER',
};
const INTERACTIVE = {
	'elk.layered.cycleBreaking.strategy': 'INTERACTIVE',
	'elk.layered.layering.strategy': 'INTERACTIVE',
	'elk.layered.crossingMinimization.semiInteractive': 'true',
	'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
	'elk.layered.nodePlacement.strategy': 'INTERACTIVE',
	'elk.separateConnectedComponents': 'false',
};

export function captureFlowGeometry(node: ElkNode): ElkNode {
	return {
		id: node.id,
		x: node.x,
		y: node.y,
		width: node.width,
		height: node.height,
		layoutOptions: node.layoutOptions?.['elk.padding']
			? { 'elk.padding': node.layoutOptions['elk.padding'] }
			: undefined,
		...(node.edges ? { edges: node.edges.map(captureFlowEdge) } : {}),
		...(node.children
			? { children: node.children.map(captureFlowGeometry) }
			: {}),
	};
}

/** ELK needs the previous bend points to position long-edge dummy nodes.
 * Copy only layout-owned geometry, never renderer routes or transient ports.
 */
function captureFlowEdge(edge: ElkExtendedEdge): ElkExtendedEdge {
	return {
		id: edge.id,
		sources: [...edge.sources],
		targets: [...edge.targets],
		container: edge.container,
		sections: edge.sections?.map((section) => ({
			id: section.id,
			startPoint: { ...section.startPoint },
			endPoint: { ...section.endPoint },
			bendPoints: section.bendPoints?.map((point) => ({ ...point })),
			incomingSections: section.incomingSections
				? [...section.incomingSections]
				: undefined,
			outgoingSections: section.outgoingSections
				? [...section.outgoingSections]
				: undefined,
		})),
	};
}

/** Port of research interactive-placement. A cold run uses model order;
 * subsequent runs hint every stage with the last automatic result.
 * Compound-node hints stay relative to their parent, as ELK requires.
 */
export function prepareInteractiveFlowGraph(
	root: ElkNode,
	previous?: ElkNode,
): void {
	const edges = root.edges ?? [];
	const oldEdges = new Map<string, ElkExtendedEdge>();
	const containerInsets = new Map<string, { x: number; y: number }>();
	const collect = (node: ElkNode): void => {
		containerInsets.set(node.id, readContainerInset(node));
		node.edges?.forEach((edge) => oldEdges.set(edge.id, edge));
		node.children?.forEach(collect);
	};
	if (previous) collect(previous);
	for (const edge of edges) {
		const old = oldEdges.get(edge.id);
		// Relation rules may reverse endpoints: such paths are not reusable.
		if (
			!old ||
			JSON.stringify(old.sources) !== JSON.stringify(edge.sources) ||
			JSON.stringify(old.targets) !== JSON.stringify(edge.targets)
		)
			continue;
		const copy = captureFlowEdge(old);
		const inset = containerInsets.get(old.container ?? root.id) ?? {
			x: 0,
			y: 0,
		};
		for (const section of copy.sections ?? []) {
			for (const point of [
				section.startPoint,
				...(section.bendPoints ?? []),
				section.endPoint,
			]) {
				point.x -= inset.x;
				point.y -= inset.y;
			}
		}
		edge.sections = copy.sections;
		edge.container = copy.container;
	}

	root.edges?.sort((a, b) => compare(a.id, b.id));
	const visit = (parent: ElkNode, prior?: ElkNode): void => {
		const children = parent.children;
		if (!children?.length) return;
		children.sort((a, b) => compare(a.id, b.id));
		const inset = prior ? readContainerInset(prior) : { x: 0, y: 0 };
		const old = new Map(
			(prior?.children ?? []).map((node) => [
				node.id,
				{
					...node,
					x: (node.x ?? 0) - inset.x,
					y: (node.y ?? 0) - inset.y,
				},
			]),
		);
		const reuse = children.some((node) => old.has(node.id));
		const base = { ...parent.layoutOptions };
		// No conflicting model-order restrictions on an interactive run.
		for (const key of [
			...Object.keys(MODEL_ORDER),
			...Object.keys(INTERACTIVE),
		])
			delete base[key];
		parent.layoutOptions = {
			...base,
			'elk.randomSeed': '1',
			...(reuse ? INTERACTIVE : MODEL_ORDER),
		};
		if (reuse) {
			const branch = new Map<string, string>();
			const register = (node: ElkNode, sibling: string): void => {
				branch.set(node.id, sibling);
				node.children?.forEach((child) => register(child, sibling));
			};
			children.forEach((node) => register(node, node.id));
			const direction =
				base['elk.direction'] ??
				root.layoutOptions?.['elk.direction'] ??
				'RIGHT';
			const horizontal = direction === 'RIGHT' || direction === 'LEFT';
			const sign = direction === 'LEFT' || direction === 'UP' ? -1 : 1;
			const gap = Number(
				base['elk.layered.spacing.nodeNodeBetweenLayers'] ?? 100,
			);
			const center = (nodes: ElkNode[], axis: 'x' | 'y'): number =>
				nodes.reduce(
					(sum, node) =>
						sum +
						(node[axis] ?? 0) +
						(node[axis === 'x' ? 'width' : 'height'] ?? 0) / 2,
					0,
				) / nodes.length;
			for (const node of children) {
				const existing = old.get(node.id);
				if (existing) {
					node.x = existing.x;
					node.y = existing.y;
					if (node.children) {
						node.width = existing.width;
						node.height = existing.height;
					}
					continue;
				}
				const parents = new Set<string>(),
					targets = new Set<string>();
				for (const edge of edges) {
					for (const source of edge.sources)
						for (const target of edge.targets) {
							const a = branch.get(source),
								b = branch.get(target);
							if (b === node.id && a && a !== b && old.has(a))
								parents.add(a);
							if (a === node.id && b && b !== a && old.has(b))
								targets.add(b);
						}
				}
				const incoming = [...parents]
					.sort(compare)
					.map((id) => old.get(id)!);
				const outgoing = [...targets]
					.sort(compare)
					.map((id) => old.get(id)!);
				const width = node.width ?? 120,
					height = node.height ?? 44;
				let x: number, y: number;
				if (incoming.length && outgoing.length) {
					x = (center(incoming, 'x') + center(outgoing, 'x')) / 2;
					y = (center(incoming, 'y') + center(outgoing, 'y')) / 2;
				} else if (incoming.length || outgoing.length) {
					const neighbors = incoming.length ? incoming : outgoing;
					const offset = sign * (incoming.length ? 1 : -1);
					x =
						center(neighbors, 'x') +
						(horizontal ? offset * (width + gap) : 0);
					y =
						center(neighbors, 'y') +
						(horizontal ? 0 : offset * (height + gap));
				} else {
					x =
						Math.max(
							0,
							...[...old.values()].map(
								(n) => (n.x ?? 0) + (n.width ?? 0),
							),
						) +
						gap +
						width / 2;
					y = height / 2 + 12;
				}
				node.x = x - width / 2;
				node.y = y - height / 2;
			}
		}
		children.forEach((child) =>
			visit(child, reuse ? old.get(child.id) : undefined),
		);
	};
	visit(root, previous);
}

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// ELK exports children inside the padded box, but interactive placement consumes
// content coordinates. Reapplying the padding on every solve causes drift.
function readContainerInset(node: ElkNode): { x: number; y: number } {
	const padding = node.layoutOptions?.['elk.padding'] ?? '';
	const read = (side: string): number =>
		Number(padding.match(new RegExp(`${side}=([0-9.]+)`))?.[1] ?? 0);
	return { x: read('left'), y: read('top') };
}
