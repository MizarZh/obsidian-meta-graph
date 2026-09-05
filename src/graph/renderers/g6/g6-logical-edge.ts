import { ExtensionCategory, Polyline, register, type EdgeData } from '@antv/g6';

export const G6_LOGICAL_EDGE_TYPE = 'meta-graph-logical-edge';

export type G6LogicalEdgeStyle = NonNullable<EdgeData['style']> & {
	controlPoints?: [number, number][];
	radius?: number;
};

// Registered separately so layout-owned routes never receive parallel transforms.
register(ExtensionCategory.EDGE, G6_LOGICAL_EDGE_TYPE, Polyline);
