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

	replaceSnapshot(snapshot: G6LabelControllerSnapshot): void {
		this.snapshot = snapshot;
	}

	override destroy(): void {
		this.context.graph.off(GraphEvent.AFTER_DRAW, this.handleAfterDraw);
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
			this.applyElement(edgeId, this.snapshot.edgeStyle);
		}
	}

	private applyElement(id: string, style: G6NodeStyle | G6EdgeStyle): void {
		const element = this.context.element?.getElement(id) as
			G6LabelOwner | undefined;
		const label = element?.getShape<Label>('label');
		if (!element || !label || typeof element.getLabelStyle !== 'function') {
			return;
		}
		const labelStyle = element.getLabelStyle({
			...element.attributes,
			...style,
		});
		if (!labelStyle) return;
		label.update(labelStyle);
	}
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
