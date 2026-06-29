import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import type { GraphPalette } from '../../styles/graph-styles';

export interface SigmaHoverState {
	activeHoverNodeId?: string;
	selectedNodeId?: string;
	hoveredNeighborhood: ReadonlySet<string>;
	forceLabels: boolean;
}

export function reduceSigmaNode(
	node: string,
	data: RuntimeNodeAttributes,
	state: SigmaHoverState,
	palette: GraphPalette,
): Partial<NodeDisplayData> {
	if (data.isBend) {
		return {
			...data,
			label: null,
			size: 0.01,
			highlighted: false,
			zIndex: -1,
		};
	}
	if (state.activeHoverNodeId && !state.hoveredNeighborhood.has(node)) {
		return {
			...data,
			color: palette.mutedNode,
			label: null,
			forceLabel: false,
			zIndex: 0,
		};
	}
	if (node === state.selectedNodeId) {
		return {
			...data,
			color: palette.selected,
			size: data.size + 3,
			highlighted: true,
			forceLabel: true,
			zIndex: 3,
		};
	}
	if (node === state.activeHoverNodeId) {
		return {
			...data,
			size: data.size + 2,
			highlighted: true,
			forceLabel: true,
			zIndex: 2,
		};
	}
	return { ...data, forceLabel: state.forceLabels, zIndex: 0 };
}

export function reduceSigmaEdge(
	data: RuntimeEdgeAttributes,
	state: Pick<SigmaHoverState, 'activeHoverNodeId'>,
	palette: GraphPalette,
	extremities: readonly [string, string],
): Partial<EdgeDisplayData> {
	const activeHoverNodeId = state.activeHoverNodeId;
	if (!activeHoverNodeId) {
		return { ...data };
	}
	const [source, target] = extremities;
	const connected =
		source === activeHoverNodeId ||
		target === activeHoverNodeId ||
		data.logicalSource === activeHoverNodeId ||
		data.logicalTarget === activeHoverNodeId;
	return connected
		? { ...data, size: data.size + 1, zIndex: 2 }
		: {
				...data,
				color: palette.mutedEdge,
				size: 0.4,
				zIndex: 0,
			};
}
