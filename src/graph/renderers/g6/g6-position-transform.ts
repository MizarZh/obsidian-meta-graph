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
import { replaceTranslateInTransform } from '@antv/g6/esm/utils/transform';
import { dispatchPositionChange } from '@antv/g6/esm/elements/shapes/image';
import {
	POSITION_ONLY_EDGE_TYPES,
	updateG6EdgePosition,
} from '@/graph/renderers/g6/g6-edge-position';
import { getG6TranslationDiagnostics } from '@/graph/renderers/g6/g6-translation-diagnostics';
import type { PlanarPerformance } from '@/graph/renderers/planar-performance';

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
	readDiagnostics?: () => PlanarPerformance | undefined,
): () => void {
	const original = node.update;
	const update: BaseNode['update'] = (attributes) => {
		const diagnostics = readDiagnostics?.();
		const started = diagnostics ? performance.now() : 0;
		const keys = Object.keys(attributes ?? {});
		if (
			!keys.length ||
			!keys.every((key) => key === 'x' || key === 'y' || key === 'z')
		) {
			diagnostics?.record('nodeFastFallbackAttributes');
			try {
				original.call(node, attributes);
			} finally {
				diagnostics?.record(
					'nodeFallbackUpdate',
					performance.now() - started,
				);
			}
			return;
		}
		const render = node.render;
		diagnostics?.record('nodeFastHit');
		node.render = () => {};
		try {
			const native = node as BaseNode;
			if (
				nativeNodes.has(node.constructor) &&
				native.attributes &&
				typeof native.setAttribute === 'function' &&
				keys.every((key) => Number.isFinite(attributes?.[key]))
			) {
				// Match BaseShape.applyTransform, but submit only position changes.
				// Reapplying all retained style keys dirties unrelated scene state.
				const { x = 0, y = 0, z, transform } = native.attributes;
				const next = replaceTranslateInTransform(
					attributes?.x ?? x,
					attributes?.y ?? y,
					attributes?.z ?? z,
					transform,
				);
				Object.assign(native.attributes, attributes);
				if (next) native.setAttribute('transform', next);
				dispatchPositionChange(native);
				diagnostics?.record('nodeMinimalPositionHit');
			} else {
				original.call(node, attributes);
			}
		} finally {
			node.render = render;
			diagnostics?.record('nodeFastUpdate', performance.now() - started);
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
				if (!edge || !POSITION_ONLY_EDGE_TYPES.has(edge.constructor)) {
					getG6TranslationDiagnostics(this.context.graph)?.record(
						edge ? 'edgeFastUnsupported' : 'edgeFastMissing',
					);
					continue;
				}
				let hook = this.edges.get(id);
				if (hook?.edge !== edge) {
					hook?.restore();
					// eslint-disable-next-line @typescript-eslint/unbound-method -- Restored by identity; invoked with call(edge).
					const original = edge.update;
					let armed = false;
					const update: BaseEdge['update'] = (attributes) => {
						const translate = armed;
						armed = false;
						const diagnostics = translate
							? getG6TranslationDiagnostics(this.context.graph)
							: undefined;
						const started = diagnostics ? performance.now() : 0;
						if (
							translate &&
							Object.keys(attributes ?? {}).length === 0 &&
							updateG6EdgePosition(edge, diagnostics)
						) {
							diagnostics?.record('edgeFastHit');
							diagnostics?.record(
								'edgeFastUpdate',
								performance.now() - started,
							);
							return;
						}
						diagnostics?.record(
							Object.keys(attributes ?? {}).length
								? 'edgeFastFallbackAttributes'
								: 'edgeFastFallbackGeometry',
						);
						try {
							original.call(edge, attributes);
						} finally {
							diagnostics?.record(
								'edgeFallbackUpdate',
								performance.now() - started,
							);
						}
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
			if (!node || !nativeNodes.has(node.constructor)) {
				getG6TranslationDiagnostics(this.context.graph)?.record(
					node ? 'nodeFastUnsupported' : 'nodeFastMissing',
				);
				continue;
			}
			const previous = this.installed.get(id);
			if (previous?.node === node) continue;
			previous?.restore();
			this.installed.set(id, {
				node,
				restore: installG6PositionOnlyUpdate(node, () =>
					getG6TranslationDiagnostics(this.context.graph),
				),
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
