import {
	BaseTransform,
	Circle,
	Diamond,
	ExtensionCategory,
	Hexagon,
	Rect,
	Star,
	Triangle,
	register,
	type BaseNode,
	type BaseEdge,
} from '@antv/g6';
import {
	POSITION_ONLY_EDGE_TYPES,
	updateG6EdgePosition,
} from '@/graph/renderers/g6/g6-edge-position';

export const G6_POSITION_TRANSFORM = 'meta-graph-position-update';
const nativeNodes: ReadonlySet<unknown> = new Set([
	Circle,
	Rect,
	Diamond,
	Triangle,
	Hexagon,
	Star,
]);

/** Instance-local G6 5.1 seam: retain its transforms and position events,
 * but don't rebuild unchanged child shapes for a position-only update. */
export function installG6PositionOnlyUpdate(
	node: Pick<BaseNode, 'update' | 'render'>,
): () => void {
	const original = node.update;
	const update: BaseNode['update'] = (attributes) => {
		const keys = Object.keys(attributes ?? {});
		if (
			!keys.length ||
			!keys.every((key) => key === 'x' || key === 'y' || key === 'z')
		) {
			original.call(node, attributes);
			return;
		}
		const render = node.render;
		node.render = () => {};
		try {
			original.call(node, attributes);
		} finally {
			node.render = render;
		}
	};
	node.update = update;
	return () => {
		if (node.update === update) node.update = original;
	};
}

export class G6PositionTransform extends BaseTransform {
	private readonly edges = new Map<
		string,
		{ edge: BaseEdge; restore: () => void; arm: () => void }
	>();
	private readonly installed = new Map<
		string,
		{ node: BaseNode; restore: () => void }
	>();

	override beforeDraw(
		data: Parameters<BaseTransform['beforeDraw']>[0],
		context: Parameters<BaseTransform['beforeDraw']>[1],
	): typeof data {
		for (const id of data.remove.edges.keys()) {
			this.edges.get(id)?.restore();
			this.edges.delete(id);
		}
		if (context.stage === 'translate') {
			for (const id of data.update.edges.keys()) {
				const edge = this.context.element?.getElement<BaseEdge>(id);
				if (!edge || !POSITION_ONLY_EDGE_TYPES.has(edge.constructor))
					continue;
				let hook = this.edges.get(id);
				if (hook?.edge !== edge) {
					hook?.restore();
					// eslint-disable-next-line @typescript-eslint/unbound-method -- Restored by identity; invoked with call(edge).
					const original = edge.update;
					let armed = false;
					const update: BaseEdge['update'] = (attributes) => {
						const translate = armed;
						armed = false;
						if (
							translate &&
							Object.keys(attributes ?? {}).length === 0 &&
							updateG6EdgePosition(edge)
						)
							return;
						original.call(edge, attributes);
					};
					edge.update = update;
					hook = {
						edge,
						arm: () => {
							armed = true;
						},
						restore: () => {
							if (edge.update === update) edge.update = original;
						},
					};
					this.edges.set(id, hook);
				}
				hook.arm();
			}
		}
		for (const id of data.remove.nodes.keys()) {
			this.installed.get(id)?.restore();
			this.installed.delete(id);
		}
		if (context.stage !== 'translate') return data;
		for (const id of data.update.nodes.keys()) {
			const node = this.context.element?.getElement<BaseNode>(id);
			if (!node || !nativeNodes.has(node.constructor)) continue;
			const previous = this.installed.get(id);
			if (previous?.node === node) continue;
			previous?.restore();
			this.installed.set(id, {
				node,
				restore: installG6PositionOnlyUpdate(node),
			});
		}
		return data;
	}

	override destroy(): void {
		for (const { restore } of this.edges.values()) restore();
		this.edges.clear();
		for (const { restore } of this.installed.values()) restore();
		this.installed.clear();
		super.destroy();
	}
}

register(
	ExtensionCategory.TRANSFORM,
	G6_POSITION_TRANSFORM,
	G6PositionTransform,
);
