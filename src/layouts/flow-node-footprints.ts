import type { RuntimeGraph } from '@/graph/model/graphology-adapter';
import type { LabelPosition } from '@/core/types';
import { FLOW_GROUP_TITLE_RESERVE_SCALE } from '@/layouts/flow-group-frame';

export interface FlowNodeFootprint {
	width: number;
	height: number;
}

/** Directional envelopes: label width must not become node height.
 * Measuring is injected so layout code stays DOM-independent. */
export function createFlowNodeFootprints(
	graph: RuntimeGraph,
	labelSize: number,
	labelOffset: number,
	measure: (text: string) => number,
	position: LabelPosition = 'right',
	scaleLabelsWithZoom = false,
	reserveLabels = true,
): Map<string, FlowNodeFootprint> {
	const footprints = new Map<string, FlowNodeFootprint>();
	graph.forEachNode((id, node) => {
		if (node.isBend || node.hidden) return;
		const radius = Math.max(0, node.size) + 4;
		const hasLabel = reserveLabels && !!node.label;
		const textScale = scaleLabelsWithZoom
			? 1 / Math.sqrt(FLOW_GROUP_TITLE_RESERVE_SCALE)
			: 1 / FLOW_GROUP_TITLE_RESERVE_SCALE;
		const gap =
			(Math.abs(labelOffset) + 6) / FLOW_GROUP_TITLE_RESERVE_SCALE;
		const width = hasLabel
			? measure(node.label) * textScale +
				8 / FLOW_GROUP_TITLE_RESERVE_SCALE
			: 0;
		const height = hasLabel
			? labelSize * textScale + 8 / FLOW_GROUP_TITLE_RESERVE_SCALE
			: 0;
		let halfWidth = radius,
			halfHeight = radius;
		if (hasLabel) {
			if (node.labelRotation) {
				const angle = node.labelRotation;
				halfWidth =
					radius +
					gap +
					Math.abs(Math.cos(angle)) * width +
					Math.abs(Math.sin(angle)) * height;
				halfHeight =
					radius +
					gap +
					Math.abs(Math.sin(angle)) * width +
					Math.abs(Math.cos(angle)) * height;
			} else if (position === 'top' || position === 'bottom') {
				halfWidth = Math.max(radius, width / 2);
				halfHeight = radius + gap + height;
			} else if (position === 'center') {
				halfWidth = Math.max(radius, width / 2);
				halfHeight = Math.max(radius, height / 2);
			} else {
				halfWidth = radius + gap + width;
				halfHeight = Math.max(radius, height / 2);
			}
		}
		footprints.set(id, {
			width: Math.max(120, halfWidth * 2),
			height: Math.max(44, halfHeight * 2),
		});
	});
	return footprints;
}
