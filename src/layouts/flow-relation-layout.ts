import type { ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import type { FlowRelationPlacement, FlowRelationRule } from '../core/types';
import type { RuntimeGraph } from '../graph/model/graphology-adapter';

const IN_LAYER_PREDECESSOR =
	'org.eclipse.elk.layered.crossingMinimization.inLayerPredOf';
const IN_LAYER_SUCCESSOR =
	'org.eclipse.elk.layered.crossingMinimization.inLayerSuccOf';
const DIRECTION_PRIORITY = 'org.eclipse.elk.layered.priority.direction';

export interface FlowLayoutPlan {
	edges: ElkExtendedEdge[];
	nodeLayoutOptions: Map<string, Record<string, string>>;
	reversedEdgeIds: Set<string>;
	conflictCount: number;
}

interface FlowEdgeRecord {
	id: string;
	source: string;
	target: string;
	current: string;
	linked: string;
	placement: FlowRelationPlacement;
}

export function createFlowLayoutPlan(
	graph: RuntimeGraph,
	rules: readonly FlowRelationRule[],
): FlowLayoutPlan {
	const placements = new Map(
		rules
			.filter((rule) => rule.field.trim())
			.map((rule) => [normalizeField(rule.field), rule.placement]),
	);
	const records = graph
		.edges()
		.filter((edge) => !graph.getEdgeAttribute(edge, 'hidden'))
		.sort((left, right) => left.localeCompare(right))
		.map((edge): FlowEdgeRecord => {
			const attributes = graph.getEdgeAttributes(edge);
			const source = graph.source(edge);
			const target = graph.target(edge);
			const current = readCurrentNode(
				attributes.sourcePath,
				source,
				target,
			);
			return {
				id: edge,
				source,
				target,
				current,
				linked: current === target ? source : target,
				placement:
					placements.get(
						normalizeField(
							attributes.sourceField ?? attributes.relation,
						),
					) ?? 'default',
			};
		});

	const components = new DisjointSet(graph.nodes());
	for (const record of records) {
		if (record.placement === 'parallel') {
			components.union(record.source, record.target);
		}
	}

	const nodeLayoutOptions = createSameLayerOptions(graph.nodes(), components);
	const reversedEdgeIds = new Set<string>();
	const edges: ElkExtendedEdge[] = [];
	const explicitConstraints = new Map<string, Set<string>>();
	let conflictCount = 0;

	for (const record of records.filter(
		(record) =>
			record.placement === 'before' || record.placement === 'after',
	)) {
		const source =
			record.placement === 'before' ? record.linked : record.current;
		const target =
			record.placement === 'before' ? record.current : record.linked;
		const sourceComponent = components.find(source);
		const targetComponent = components.find(target);
		if (
			sourceComponent === targetComponent ||
			hasPath(explicitConstraints, targetComponent, sourceComponent)
		) {
			conflictCount += 1;
			continue;
		}
		addConstraint(explicitConstraints, sourceComponent, targetComponent);
		edges.push(createElkEdge(record.id, source, target, true));
		if (source !== record.source || target !== record.target) {
			reversedEdgeIds.add(record.id);
		}
	}

	for (const record of records.filter(
		(record) => record.placement === 'default',
	)) {
		const sourceComponent = components.find(record.source);
		const targetComponent = components.find(record.target);
		if (
			sourceComponent === targetComponent ||
			hasPath(explicitConstraints, targetComponent, sourceComponent)
		) {
			conflictCount += 1;
			continue;
		}
		edges.push(
			createElkEdge(record.id, record.source, record.target, false),
		);
	}

	return {
		edges,
		nodeLayoutOptions,
		reversedEdgeIds,
		conflictCount,
	};
}

function createElkEdge(
	id: string,
	source: string,
	target: string,
	explicit: boolean,
): ElkExtendedEdge {
	return {
		id,
		sources: [source],
		targets: [target],
		...(explicit ? { layoutOptions: { [DIRECTION_PRIORITY]: '100' } } : {}),
	};
}

function readCurrentNode(
	sourcePath: string | undefined,
	source: string,
	target: string,
): string {
	return sourcePath === target ? target : source;
}

function normalizeField(field: string): string {
	return field.trim().toLocaleLowerCase();
}

function createSameLayerOptions(
	nodes: string[],
	components: DisjointSet,
): Map<string, Record<string, string>> {
	const groups = new Map<string, string[]>();
	for (const node of nodes) {
		const root = components.find(node);
		const group = groups.get(root) ?? [];
		group.push(node);
		groups.set(root, group);
	}
	const options = new Map<string, Record<string, string>>();
	for (const group of groups.values()) {
		group.sort((left, right) => left.localeCompare(right));
		for (let index = 0; index < group.length - 1; index += 1) {
			const predecessor = group[index];
			const successor = group[index + 1];
			if (!predecessor || !successor) {
				continue;
			}
			options.set(predecessor, {
				...(options.get(predecessor) ?? {}),
				[IN_LAYER_PREDECESSOR]: successor,
			});
			options.set(successor, {
				...(options.get(successor) ?? {}),
				[IN_LAYER_SUCCESSOR]: predecessor,
			});
		}
	}
	return options;
}

function hasPath(
	constraints: ReadonlyMap<string, ReadonlySet<string>>,
	start: string,
	target: string,
): boolean {
	if (start === target) {
		return true;
	}
	const visited = new Set<string>();
	const pending = [start];
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current || visited.has(current)) {
			continue;
		}
		visited.add(current);
		for (const next of constraints.get(current) ?? []) {
			if (next === target) {
				return true;
			}
			pending.push(next);
		}
	}
	return false;
}

function addConstraint(
	constraints: Map<string, Set<string>>,
	source: string,
	target: string,
): void {
	const targets = constraints.get(source) ?? new Set<string>();
	targets.add(target);
	constraints.set(source, targets);
}

class DisjointSet {
	private readonly parents = new Map<string, string>();

	constructor(nodes: string[]) {
		for (const node of nodes) {
			this.parents.set(node, node);
		}
	}

	find(node: string): string {
		const parent = this.parents.get(node) ?? node;
		if (parent === node) {
			return node;
		}
		const root = this.find(parent);
		this.parents.set(node, root);
		return root;
	}

	union(left: string, right: string): void {
		const leftRoot = this.find(left);
		const rightRoot = this.find(right);
		if (leftRoot === rightRoot) {
			return;
		}
		if (leftRoot.localeCompare(rightRoot) <= 0) {
			this.parents.set(rightRoot, leftRoot);
		} else {
			this.parents.set(leftRoot, rightRoot);
		}
	}
}
