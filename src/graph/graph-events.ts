import type { RuntimeGraph } from './graphology-adapter';
import type { SigmaRenderer } from './sigma-renderer';

export interface GraphEventCallbacks {
	onSelect(nodeId?: string): void;
	onHover(nodeId?: string): void;
	onOpen(nodeId: string): void;
}

export function bindGraphEvents(
	renderer: SigmaRenderer,
	callbacks: GraphEventCallbacks,
): () => void {
	const sigma = renderer.instance;
	const clickNode = ({ node }: { node: string }) => {
		if (sigma.getGraph().getNodeAttribute(node, 'isBend')) {
			return;
		}
		callbacks.onSelect(node);
		callbacks.onOpen(node);
	};
	const clickStage = () => callbacks.onSelect(undefined);
	const enterNode = ({ node }: { node: string }) => {
		if (!sigma.getGraph().getNodeAttribute(node, 'isBend')) {
			callbacks.onHover(node);
		}
	};
	const leaveNode = () => callbacks.onHover(undefined);

	sigma.on('clickNode', clickNode);
	sigma.on('clickStage', clickStage);
	sigma.on('enterNode', enterNode);
	sigma.on('leaveNode', leaveNode);

	return () => {
		sigma.off('clickNode', clickNode);
		sigma.off('clickStage', clickStage);
		sigma.off('enterNode', enterNode);
		sigma.off('leaveNode', leaveNode);
	};
}

export function immediateNeighborhood(
	graph: RuntimeGraph,
	nodeId: string,
): Set<string> {
	const neighbors = new Set([nodeId]);
	graph.forEachEdge(
		nodeId,
		(
			_edge,
			attributes,
			source,
			target,
			_sourceAttributes,
			_targetAttributes,
		) => {
			if (attributes.logicalSource === nodeId && attributes.logicalTarget) {
				neighbors.add(attributes.logicalTarget);
			} else if (
				attributes.logicalTarget === nodeId &&
				attributes.logicalSource
			) {
				neighbors.add(attributes.logicalSource);
			} else {
				neighbors.add(source === nodeId ? target : source);
			}
		},
	);
	return neighbors;
}
