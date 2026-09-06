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
import type { G6EdgeStyle, G6NodeStyle } from './g6-styles';

export const G6_LABEL_CONTROLLER_KEY = 'meta-graph-label-controller';

export interface G6LabelControllerSnapshot {
	nodeIds: ReadonlySet<string>;
	edgeIds: ReadonlySet<string>;
	nodeStyle: G6NodeStyle;
	nodeStyles?: ReadonlyMap<string, G6NodeStyle>;
	edgeStyle: G6EdgeStyle;
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
	private snapshot: G6LabelControllerSnapshot;
	private readonly labelShapes = new Map<string, Label>();
	private edgeLabelsSuppressed = false;
	private suppressedEdgeExemptions = new Set<string>();
	private readonly handleAfterDraw = (event: IGraphLifeCycleEvent): void => {
		const changes = readDataChanges(event.data);
		if (!changes) return;
		const nodeIds = new Set<string>();
		const edgeIds = new Set<string>();
		for (const change of changes) {
			const id = readChangeId(change);
			if (!id) continue;
			if (this.snapshot.nodeIds.has(id)) nodeIds.add(id);
			if (this.snapshot.edgeIds.has(id)) edgeIds.add(id);
		}
		if (nodeIds.size === 0 && edgeIds.size === 0) return;
		this.applyIds(nodeIds, edgeIds);
	};

	constructor(context: RuntimeContext, options: G6LabelControllerOptions) {
		super(context, options);
		this.snapshot = options.snapshot;
		context.graph.on(GraphEvent.AFTER_DRAW, this.handleAfterDraw);
	}

	updateLabels(snapshot: G6LabelControllerSnapshot): void {
		this.snapshot = snapshot;
		this.applyIds(snapshot.nodeIds, snapshot.edgeIds);
	}

	updateZoomScale(nodeStyle: G6NodeStyle, edgeStyle: G6EdgeStyle): void {
		const nodePatch = createZoomLabelPatch(nodeStyle);
		const edgePatch = createZoomLabelPatch(edgeStyle);
		for (const nodeId of this.snapshot.nodeIds) {
			this.getLabelShape(nodeId)?.update(nodePatch);
		}
		for (const edgeId of this.snapshot.edgeIds) {
			this.getLabelShape(edgeId)?.update(edgePatch);
		}
	}

	replaceSnapshot(snapshot: G6LabelControllerSnapshot): void {
		this.snapshot = snapshot;
		// A scene replacement can reuse ids with newly-created G6 elements.
		// Resolve their label shapes lazily instead of retaining stale shape objects.
		this.labelShapes.clear();
	}

	setEdgeLabelsSuppressed(
		suppressed: boolean,
		exemptEdgeIds: Iterable<string> = [],
	): void {
		const nextExemptions = new Set(exemptEdgeIds);
		if (
			this.edgeLabelsSuppressed === suppressed &&
			setsEqual(this.suppressedEdgeExemptions, nextExemptions)
		) {
			return;
		}
		this.edgeLabelsSuppressed = suppressed;
		this.suppressedEdgeExemptions = nextExemptions;
		for (const edgeId of this.snapshot.edgeIds) {
			this.applyElement(edgeId, this.snapshot.edgeStyle, true);
		}
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
			});
		}
		for (const edgeId of edgeIds) {
			this.applyElement(edgeId, this.snapshot.edgeStyle, true);
		}
	}

	private applyElement(
		id: string,
		style: G6NodeStyle | G6EdgeStyle,
		edge = false,
	): void {
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
		label.update({
			...labelStyle,
			...(edge
				? {
						visibility:
							this.edgeLabelsSuppressed &&
							!this.suppressedEdgeExemptions.has(id)
								? 'hidden'
								: 'visible',
					}
				: {}),
		});
	}

	private getLabelShape(id: string): Label | undefined {
		const cached = this.labelShapes.get(id);
		if (cached) return cached;
		const element = this.context.element?.getElement(id) as
			G6LabelOwner | undefined;
		const label = element?.getShape<Label>('label');
		if (label) this.labelShapes.set(id, label);
		return label;
	}
}

function createZoomLabelPatch(
	style: G6NodeStyle | G6EdgeStyle,
): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	if (typeof style.labelFontSize === 'number') {
		patch.fontSize = style.labelFontSize;
	}
	if (typeof style.labelLineHeight === 'number') {
		patch.lineHeight = style.labelLineHeight;
	}
	if (style.labelPadding !== undefined) {
		patch.padding = style.labelPadding;
	}
	return patch;
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
	if (left.size !== right.size) return false;
	for (const value of left) if (!right.has(value)) return false;
	return true;
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
