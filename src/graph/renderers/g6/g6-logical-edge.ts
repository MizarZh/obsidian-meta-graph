import {
	ExtensionCategory,
	Polyline,
	register,
	type EdgeData,
	type Point,
	type PolylineStyleProps,
} from '@antv/g6';

export const G6_LOGICAL_EDGE_TYPE = 'meta-graph-logical-edge';

export type G6LogicalEdgeStyle = NonNullable<EdgeData['style']> & {
	controlPoints?: [number, number][];
	radius?: number;
};

export class G6LogicalEdge extends Polyline {
	protected override getControlPoints(
		attributes: Required<PolylineStyleProps>,
	): Point[] {
		const points = super.getControlPoints(attributes);
		let start = 0;
		let end = points.length;
		// Layout bends can lie inside the rendered node after size changes.
		// Keeping them makes the final segment run outward, reversing its arrow.
		const inside = (
			node: typeof this.sourceNode,
			point: Point,
		): boolean => {
			const center = node.getCenter();
			const distance = Math.hypot(
				point[0] - center[0],
				point[1] - center[1],
			);
			if (distance < 1e-8) return true;
			const boundary = node.getIntersectPoint(point);
			const boundaryDistance = Math.hypot(
				boundary[0] - center[0],
				boundary[1] - center[1],
			);
			// G6 polygon nodes return their center when an internal segment
			// has no boundary intersection; circles return the radial boundary.
			return (
				boundaryDistance < 1e-8 || distance <= boundaryDistance + 1e-8
			);
		};
		while (start < end && inside(this.sourceNode, points[start]!)) start++;
		while (end > start && inside(this.targetNode, points[end - 1]!)) end--;
		return points.slice(start, end);
	}
}

// Layout-owned routes never receive parallel transforms or mutate their snapshot.
register(ExtensionCategory.EDGE, G6_LOGICAL_EDGE_TYPE, G6LogicalEdge);
