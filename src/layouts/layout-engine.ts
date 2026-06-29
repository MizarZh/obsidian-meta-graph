import type { RuntimeGraph } from '../graph/model/graphology-adapter';

export interface LayoutEngine {
	apply(graph: RuntimeGraph): Promise<void>;
}
