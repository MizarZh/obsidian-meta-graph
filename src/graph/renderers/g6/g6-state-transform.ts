import {
	BaseTransform,
	ExtensionCategory,
	register,
	type ElementDatum,
	type ElementType,
	type RuntimeContext,
	type State,
} from '@antv/g6';

export const G6_STATE_TRANSFORM = 'meta-graph-state-update';
type DrawData = Parameters<BaseTransform['beforeDraw']>[0];
type DrawContext = Parameters<BaseTransform['beforeDraw']>[1];

// G6 5.1.x exposes no sparse computeStyle hook. Keep the compatibility seam
// instance-local, feature-checked, and restore it when the transform is removed.
interface StyleController {
	computeStyle: (stage?: string, ids?: string[]) => void;
	computeElementDefaultStyle(
		type: ElementType,
		context: { datum: ElementDatum; graph: RuntimeContext['graph'] },
	): void;
	computeElementStatesStyle(
		type: ElementType,
		states: State[],
		context: { datum: ElementDatum; graph: RuntimeContext['graph'] },
	): void;
}

export class G6StateTransform extends BaseTransform {
	private controller?: StyleController;
	private original?: StyleController['computeStyle'];
	private pending?: DrawData;
	private readonly computeSparseStyle = (
		stage?: string,
		ids?: string[],
	): void => {
		const data = this.pending;
		this.pending = undefined;
		if (stage !== 'state' || !data) {
			this.original?.call(this.controller, stage, ids);
			return;
		}
		for (const [key, type] of [
			['nodes', 'node'],
			['edges', 'edge'],
			['combos', 'combo'],
		] as const) {
			for (const datum of data.update[key].values())
				this.computeDatum(type, datum);
		}
	};

	override beforeDraw(data: DrawData, context: DrawContext): DrawData {
		this.pending = undefined;
		if (context.stage !== 'state' || !this.install()) return data;
		// Structural work or a palette update needs G6's complete pipeline.
		if (
			Object.values(data.add).some((items) => items.size) ||
			Object.values(data.remove).some((items) => items.size) ||
			data.update.combos.size ||
			this.context.options.node?.palette ||
			this.context.options.edge?.palette
		)
			return data;
		const changes = this.context.model.getChanges();
		const explicitEdges = new Set<string>();
		const geometryNodes = new Set<string>();
		for (const change of changes) {
			if (change.type === 'EdgeUpdated')
				explicitEdges.add(String(change.value.id));
			if (change.type !== 'NodeUpdated') continue;
			const datum = change.value;
			const id = String(datum.id);
			const oldData = { ...change.original };
			const newData = { ...datum };
			delete oldData.states;
			delete newData.states;
			if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
				geometryNodes.add(id);
				continue;
			}
			this.computeDatum('node', datum);
			const element = this.context.element?.getElement(id);
			const next = this.context.element?.getElementComputedStyle(
				'node',
				datum,
			) as Record<string, unknown> | undefined;
			const previous = element?.attributes as
				Record<string, unknown> | undefined;
			if (
				!next ||
				!previous ||
				[
					'size',
					'x',
					'y',
					'z',
					'rotation',
					'transform',
					'ports',
					'lineWidth',
				].some(
					(key) =>
						next[key] !== undefined &&
						JSON.stringify(previous[key]) !==
							JSON.stringify(next[key]),
				)
			)
				geometryNodes.add(id);
		}
		// The required update-related-edges transform runs before this one.
		// Keep explicit edge updates and edges whose endpoints really changed.
		for (const [id, edge] of data.update.edges) {
			if (
				!explicitEdges.has(id) &&
				!geometryNodes.has(edge.source) &&
				!geometryNodes.has(edge.target)
			)
				data.update.edges.delete(id);
		}
		this.pending = data;
		return data;
	}

	private computeDatum(type: ElementType, datum: ElementDatum): void {
		const context = { datum, graph: this.context.graph };
		this.controller?.computeElementDefaultStyle(type, context);
		this.controller?.computeElementStatesStyle(
			type,
			datum.states ?? [],
			context,
		);
	}

	private install(): boolean {
		if (this.controller) return true;
		const controller = this.context.element as unknown as
			StyleController | undefined;
		if (
			!controller ||
			typeof controller.computeStyle !== 'function' ||
			typeof controller.computeElementDefaultStyle !== 'function' ||
			typeof controller.computeElementStatesStyle !== 'function'
		)
			return false;
		this.controller = controller;
		this.original = controller.computeStyle;
		controller.computeStyle = this.computeSparseStyle;
		return true;
	}

	override destroy(): void {
		if (
			this.controller?.computeStyle === this.computeSparseStyle &&
			this.original
		)
			this.controller.computeStyle = this.original;
		this.pending = undefined;
		super.destroy();
	}
}

register(ExtensionCategory.TRANSFORM, G6_STATE_TRANSFORM, G6StateTransform);
