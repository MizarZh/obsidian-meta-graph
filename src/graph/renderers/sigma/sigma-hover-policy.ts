import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';
import type {
	RuntimeEdgeAttributes,
	RuntimeNodeAttributes,
} from '../../model/graphology-adapter';
import type { GraphPalette } from '../../styles/graph-styles';
import { withAlpha } from '../../styles/graph-styles';

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
	const opacity = clampOpacity(data.opacity ?? 1);
	const styledColor =
		opacity === 1 ? {} : { color: withAlpha(data.color, opacity) };
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
			color:
				opacity === 1
					? palette.mutedNode
					: withAlpha(palette.mutedNode, opacity * 0.18),
			label: null,
			forceLabel: false,
			zIndex: 0,
		};
	}
	if (node === state.selectedNodeId) {
		return {
			...data,
			color:
				opacity === 1
					? palette.selected
					: withAlpha(palette.selected, opacity),
			size: data.size + 3,
			highlighted: true,
			forceLabel: true,
			zIndex: 3,
		};
	}
	if (node === state.activeHoverNodeId) {
		return {
			...data,
			...styledColor,
			size: data.size + 2,
			highlighted: true,
			forceLabel: true,
			zIndex: 2,
		};
	}
	return {
		...data,
		...styledColor,
		forceLabel: state.forceLabels,
		zIndex: 0,
	};
}

function clampOpacity(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function reduceSigmaEdge(
	data: RuntimeEdgeAttributes,
	state: Pick<SigmaHoverState, 'activeHoverNodeId'>,
	palette: GraphPalette,
	extremities: readonly [string, string],
): Partial<EdgeDisplayData> {
	if (isCanvasParallelEdge(data, extremities)) {
		return {
			...data,
			hidden: true,
			label: null,
			forceLabel: false,
		};
	}
	const opacity = Math.max(0, Math.min(1, data.opacity ?? 1));
	const color = withAlpha(data.color, opacity);
	const activeHoverNodeId = state.activeHoverNodeId;
	if (!activeHoverNodeId) {
		return opacity === 1 ? { ...data } : { ...data, color };
	}
	const [source, target] = extremities;
	const connected =
		source === activeHoverNodeId ||
		target === activeHoverNodeId ||
		data.logicalSource === activeHoverNodeId ||
		data.logicalTarget === activeHoverNodeId;
	return connected
		? {
				...data,
				...(opacity === 1 ? {} : { color }),
				size: data.size + 1,
				zIndex: 2,
			}
		: {
				...data,
				color:
					opacity === 1
						? palette.mutedEdge
						: withAlpha(palette.mutedEdge, opacity * 0.12),
				size: 0.4,
				zIndex: 0,
			};
}

export function isCanvasParallelEdge(
	data: RuntimeEdgeAttributes,
	extremities: readonly [string, string],
): boolean {
	if ((data.parallelCount ?? 1) < 2) return false;
	const [source, target] = extremities;
	return (data.logicalSource ?? source) !== (data.logicalTarget ?? target);
}
