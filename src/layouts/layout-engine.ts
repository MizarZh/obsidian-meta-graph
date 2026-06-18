import type { RuntimeGraph } from '../graph/graphology-adapter';

export interface LayoutEngine {
	apply(graph: RuntimeGraph): Promise<void>;
}
