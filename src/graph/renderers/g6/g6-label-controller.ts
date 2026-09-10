import {
	BasePlugin,
	ExtensionCategory,
	GraphEvent,
	register,
	type BasePluginOptions,
	type IGraphLifeCycleEvent,
	type Label,
	type RuntimeContext,
} from '@antv/g6';
import type { G6EdgeStyle, G6NodeStyle } from '@/graph/renderers/g6/g6-styles';

export const G6_LABEL_CONTROLLER_KEY = 'meta-graph-label-controller';

export interface G6LabelControllerSnapshot {
	fullLabelNodeIds?: ReadonlySet<string>;
	/** Membership and placement contain only dirty owners. */
	partial?: boolean;
	nodeIds: ReadonlySet<string>;
	edgeIds: ReadonlySet<string>;
	nodeStyle: G6NodeStyle;
	nodeStyles?: ReadonlyMap<string, G6NodeStyle>;
	edgeStyle: G6EdgeStyle;
}

export interface G6LabelControllerDirtyIds {
	nodeIds?: Iterable<string>;
	edgeIds?: Iterable<string>;
}

interface G6LabelControllerOptions extends BasePluginOptions {
	snapshot: G6LabelControllerSnapshot;
}

interface G6LabelOwner {
	attributes: Record<string, unknown>;
	getLabelStyle(
		attributes: Record<string, unknown>,
	): Record<string, unknown> | false;
	getShape<T>(name: string): T | undefined;
}

export class G6LabelController extends BasePlugin<G6LabelControllerOptions> {
	private snapshot: G6LabelControllerSnapshot & {
		nodeIds: Set<string>;
		edgeIds: Set<string>;
		nodeStyles: Map<string, G6NodeStyle>;
	};
	private readonly labelShapes = new Map<string, Label>();
	private zoomScale = 1;
	private readonly handleAfterDraw = (event: IGraphLifeCycleEvent): void => {
		const data: unknown = event.data;
		const changes = readDataChanges(data);
		if (!changes) return;
		const translating =
			data !== null &&
			typeof data === 'object' &&
			'stage' in data &&
			data.stage === 'translate';
		const nodeIds = new Set<string>();
		const edgeIds = new Set<string>();
		for (const change of changes) {
			const id = readChangeId(change);
			if (!id) continue;
			if (this.snapshot.nodeIds.has(id)) {
				// A retained node label inherits its parent's translation. Reapplying
				// its style rebuilds text/background unnecessarily on every force tick.
				// New/replaced labels still need our style and zoom scale applied.
				const cached = this.labelShapes.get(id);
				const retained =
					translating &&
					cached &&
					this.context.element?.getElement(id)?.getShape('label') ===
						cached;
				if (!retained) nodeIds.add(id);
			}
			if (this.snapshot.edgeIds.has(id)) edgeIds.add(id);
		}
		if (nodeIds.size === 0 && edgeIds.size === 0) return;
		this.applyIds(nodeIds, edgeIds);
	};

	constructor(context: RuntimeContext, options: G6LabelControllerOptions) {
		super(context, options);
		this.snapshot = ownSnapshot(options.snapshot);
		context.graph.on(GraphEvent.AFTER_DRAW, this.handleAfterDraw);
	}

	updateLabels(
		snapshot: G6LabelControllerSnapshot,
		dirtyIds?: G6LabelControllerDirtyIds,
	): void {
		if (snapshot.partial && dirtyIds) {
			this.snapshot.fullLabelNodeIds = snapshot.fullLabelNodeIds;
			for (const id of dirtyIds.nodeIds ?? []) {
				if (snapshot.nodeIds.has(id)) this.snapshot.nodeIds.add(id);
				else this.snapshot.nodeIds.delete(id);
				const style = snapshot.nodeStyles?.get(id);
				if (style) this.snapshot.nodeStyles.set(id, style);
				else this.snapshot.nodeStyles.delete(id);
			}
			for (const id of dirtyIds.edgeIds ?? []) {
				if (snapshot.edgeIds.has(id)) this.snapshot.edgeIds.add(id);
				else this.snapshot.edgeIds.delete(id);
			}
		} else {
			this.snapshot = ownSnapshot(
				dirtyIds
					? mergeDirtyNodeStyles(
							this.snapshot,
							snapshot,
							dirtyIds.nodeIds,
						)
					: snapshot,
			);
		}
		if (dirtyIds) {
			this.pruneLabelShapes([
				...(dirtyIds.nodeIds ?? []),
				...(dirtyIds.edgeIds ?? []),
			]);
		} else {
			this.pruneLabelShapes();
		}
		this.applyIds(
			dirtyIds?.nodeIds ?? snapshot.nodeIds,
			dirtyIds?.edgeIds ?? snapshot.edgeIds,
		);
	}

	replaceSnapshot(snapshot: G6LabelControllerSnapshot): void {
		this.snapshot = ownSnapshot(snapshot);
		this.labelShapes.clear();
	}

	updateZoomScale(scale: number): void {
		if (!Number.isFinite(scale) || scale <= 0) return;
		this.zoomScale = scale;
		for (const id of this.snapshot.nodeIds) this.scaleLabel(id);
		for (const id of this.snapshot.edgeIds) this.scaleLabel(id);
	}

	override destroy(): void {
		this.context.graph.off(GraphEvent.AFTER_DRAW, this.handleAfterDraw);
		this.labelShapes.clear();
		super.destroy();
	}

	private applyIds(
		nodeIds: Iterable<string>,
		edgeIds: Iterable<string>,
	): void {
		for (const nodeId of nodeIds) {
			this.applyElement(nodeId, {
				...this.snapshot.nodeStyle,
				...this.snapshot.nodeStyles?.get(nodeId),
				...(this.snapshot.fullLabelNodeIds?.has(nodeId)
					? { labelWordWrap: false }
					: {}),
			});
		}
		for (const edgeId of edgeIds) {
			this.applyElement(edgeId, this.snapshot.edgeStyle);
		}
	}

	private applyElement(id: string, style: G6NodeStyle | G6EdgeStyle): void {
		const element = this.context.element?.getElement(id) as
			G6LabelOwner | undefined;
		const label = element?.getShape<Label>('label');
		if (!element || !label || typeof element.getLabelStyle !== 'function') {
			this.labelShapes.delete(id);
			return;
		}
		this.labelShapes.set(id, label);
		const attributes = { ...element.attributes };
		// setData() merges styles for stable ids. Remove layout-owned label fields
		// before asking G6 to resolve the current label so omitted Arc/HEB values
		// cannot survive in Graph, Flow, or an unrotated Arc configuration.
		delete attributes.labelTransform;
		delete attributes.labelTextAlign;
		delete attributes.labelTextBaseline;
		const labelStyle = element.getLabelStyle({
			...attributes,
			...style,
		});
		if (!labelStyle) return;
		label.update(labelStyle);
		label.setLocalScale(this.zoomScale);
	}

	private scaleLabel(id: string): void {
		let label = this.labelShapes.get(id);
		if (!label) {
			const element = this.context.element?.getElement(id) as
				G6LabelOwner | undefined;
			label = element?.getShape<Label>('label');
			if (!label) return;
			this.labelShapes.set(id, label);
		}
		label.setLocalScale(this.zoomScale);
	}

	private pruneLabelShapes(
		ids: Iterable<string> = this.labelShapes.keys(),
	): void {
		for (const id of ids) {
			if (
				!this.snapshot.nodeIds.has(id) &&
				!this.snapshot.edgeIds.has(id)
			) {
				this.labelShapes.delete(id);
			}
		}
	}
}

function ownSnapshot(snapshot: G6LabelControllerSnapshot) {
	return {
		...snapshot,
		nodeIds: new Set(snapshot.nodeIds),
		edgeIds: new Set(snapshot.edgeIds),
		nodeStyles: new Map(snapshot.nodeStyles),
	};
}

function mergeDirtyNodeStyles(
	previous: G6LabelControllerSnapshot,
	next: G6LabelControllerSnapshot,
	dirtyNodeIds: Iterable<string> = [],
): G6LabelControllerSnapshot {
	const nodeStyles = new Map(previous.nodeStyles);
	for (const nodeId of nodeStyles.keys())
		if (!next.nodeIds.has(nodeId)) nodeStyles.delete(nodeId);
	for (const nodeId of dirtyNodeIds) {
		const style = next.nodeStyles?.get(nodeId);
		if (style) nodeStyles.set(nodeId, style);
		else nodeStyles.delete(nodeId);
	}
	return { ...next, nodeStyles };
}

function readDataChanges(data: unknown): readonly unknown[] | undefined {
	if (!data || typeof data !== 'object' || !('dataChanges' in data)) {
		return undefined;
	}
	return Array.isArray(data.dataChanges) ? data.dataChanges : undefined;
}

function readChangeId(change: unknown): string | undefined {
	if (!change || typeof change !== 'object' || !('value' in change)) {
		return undefined;
	}
	const value = change.value;
	if (!value || typeof value !== 'object' || !('id' in value)) {
		return undefined;
	}
	return typeof value.id === 'string' ? value.id : undefined;
}

register(ExtensionCategory.PLUGIN, G6_LABEL_CONTROLLER_KEY, G6LabelController);
