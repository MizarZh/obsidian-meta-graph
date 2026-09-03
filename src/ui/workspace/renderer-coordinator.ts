import type { GraphProjection, WorkspaceState } from '../../core/types';
import {
	refreshRendererGraphStyles,
	refreshRendererGraphVisibility,
	type GraphRenderer,
} from '../../graph/renderers/renderer-adapter';
import { readGraphPalette } from '../../graph/styles/graph-styles';
import {
	analyzeWorkspaceStateChanges,
	createWorkspaceRenderBaseline,
	syncWorkspaceRenderBaselineStyles,
	type WorkspaceRenderBaseline,
} from './change-tracker';
import { syncRendererDisplaySettings } from './renderer-display-sync';
import type { WorkspaceRendererLifecycle } from './renderer-lifecycle';
import {
	createWorkspaceRenderPlan,
	type WorkspaceRenderPlan,
} from './render-plan';
import {
	syncWorkspaceRuntimeGraphStyles,
	syncWorkspaceRuntimeGraphVisibility,
} from './runtime-graph';

interface AnimationFrameHost {
	requestAnimationFrame(callback: FrameRequestCallback): number;
	cancelAnimationFrame(handle: number): void;
}

export interface WorkspaceRenderCoordinatorOptions {
	window: AnimationFrameHost;
	rendererLifecycle: WorkspaceRendererLifecycle;
	readCanvas(): HTMLDivElement | undefined;
	readHoveredNodeId(): string | undefined;
	syncRendererGroups(): void;
	setRendererError(error: unknown): void;
	recordPerformance?(
		name: string,
		durationMs: number,
		details: Record<string, number>,
	): void;
}

export class WorkspaceRenderCoordinator {
	private baseline: WorkspaceRenderBaseline = {};
	private visibilityPaintFrame: number | undefined;
	private visibilityApplyFrame: number | undefined;
	private pendingVisibilityRenderer: GraphRenderer | undefined;
	private pendingVisibilityPrevious: GraphProjection | undefined;
	private pendingVisibilityNext: GraphProjection | undefined;

	constructor(private readonly options: WorkspaceRenderCoordinatorOptions) {}

	apply(
		nextState: WorkspaceState,
		previousState: WorkspaceState,
	): WorkspaceRenderPlan {
		const changes = analyzeWorkspaceStateChanges(
			nextState,
			previousState,
			this.baseline,
		);
		const plan = createWorkspaceRenderPlan(changes);

		if (plan.syncGroupsBeforeRuntime) {
			this.baseline.manualLayout = nextState.manualLayout;
			this.baseline.grouping = nextState.grouping;
			this.options.syncRendererGroups();
		}

		const renderer = this.options.rendererLifecycle.renderer;
		if (plan.syncDisplay) {
			syncRendererDisplaySettings(renderer, nextState, changes);
		}

		if (plan.cancelPendingVisibility) {
			this.cancelPendingVisibilitySync();
		}
		const canvas = this.options.readCanvas();
		if (renderer && nextState.projection && canvas) {
			if (plan.runtimeGraphSync === 'visibility') {
				this.scheduleVisibilitySync(
					renderer,
					previousState.projection,
					nextState.projection,
				);
			} else if (plan.runtimeGraphSync === 'styles') {
				syncWorkspaceRuntimeGraphStyles(
					renderer.runtimeGraph,
					nextState.projection,
					nextState,
					readGraphPalette(canvas),
				);
				refreshRendererGraphStyles(renderer);
			}
			if (plan.syncStyleBaseline) {
				syncWorkspaceRenderBaselineStyles(this.baseline, nextState);
			}
		}

		if (plan.applyForceLayoutToggle) {
			this.options.rendererLifecycle.handleForceLayoutToggle(
				nextState.enableForceLayout,
			);
		}
		if (plan.syncGroupsAfterForceLayoutToggle) {
			this.options.syncRendererGroups();
		}
		if (plan.restartForceLayout) {
			this.options.rendererLifecycle.restartSigmaForceLayoutIfNeeded();
		}

		if (plan.rebuild) {
			this.baseline = createWorkspaceRenderBaseline(nextState);
			void this.options.rendererLifecycle
				.rebuild(plan.rebuild.fitAfterRender, plan.rebuild.forceLayout)
				.catch((error: unknown) =>
					this.options.setRendererError(error),
				);
		} else if (plan.syncSelection) {
			this.options.rendererLifecycle.setSelection(
				nextState.selectedNodeId,
				nextState.selectedEdgeId,
				nextState.selectedGroupId,
			);
			this.options.rendererLifecycle.setHovered(
				this.options.readHoveredNodeId(),
			);
		}

		return plan;
	}

	dispose(): void {
		this.cancelPendingVisibilitySync();
	}

	private scheduleVisibilitySync(
		renderer: GraphRenderer,
		previousProjection: GraphProjection | undefined,
		nextProjection: GraphProjection,
	): void {
		if (this.pendingVisibilityRenderer !== renderer) {
			this.pendingVisibilityPrevious = previousProjection;
		}
		this.pendingVisibilityRenderer = renderer;
		this.pendingVisibilityNext = nextProjection;
		if (
			this.visibilityPaintFrame !== undefined ||
			this.visibilityApplyFrame !== undefined
		) {
			return;
		}
		this.visibilityPaintFrame = this.options.window.requestAnimationFrame(
			() => {
				this.visibilityPaintFrame = undefined;
				this.visibilityApplyFrame =
					this.options.window.requestAnimationFrame(() => {
						this.visibilityApplyFrame = undefined;
						this.applyPendingVisibility();
					});
			},
		);
	}

	private applyPendingVisibility(): void {
		const renderer = this.pendingVisibilityRenderer;
		const previousProjection = this.pendingVisibilityPrevious;
		const nextProjection = this.pendingVisibilityNext;
		this.pendingVisibilityRenderer = undefined;
		this.pendingVisibilityPrevious = undefined;
		this.pendingVisibilityNext = undefined;
		if (
			!renderer ||
			!nextProjection ||
			this.options.rendererLifecycle.renderer !== renderer
		) {
			return;
		}
		const changedNodeIds = readChangedVisibilityNodeIds(
			previousProjection,
			nextProjection,
		);
		if (changedNodeIds.length === 0) {
			return;
		}
		const startedAt = performance.now();
		const changes = syncWorkspaceRuntimeGraphVisibility(
			renderer.runtimeGraph,
			nextProjection,
			changedNodeIds,
		);
		if (changes.nodeIds.length > 0 || changes.edgeIds.length > 0) {
			refreshRendererGraphVisibility(renderer, changes);
		}
		this.options.recordPerformance?.(
			'render.visibility',
			performance.now() - startedAt,
			{
				nodeCount: changes.nodeIds.length,
				edgeCount: changes.edgeIds.length,
			},
		);
	}

	private cancelPendingVisibilitySync(): void {
		if (this.visibilityPaintFrame !== undefined) {
			this.options.window.cancelAnimationFrame(this.visibilityPaintFrame);
			this.visibilityPaintFrame = undefined;
		}
		if (this.visibilityApplyFrame !== undefined) {
			this.options.window.cancelAnimationFrame(this.visibilityApplyFrame);
			this.visibilityApplyFrame = undefined;
		}
		this.pendingVisibilityRenderer = undefined;
		this.pendingVisibilityPrevious = undefined;
		this.pendingVisibilityNext = undefined;
	}
}

export function readChangedVisibilityNodeIds(
	previousProjection: GraphProjection | undefined,
	nextProjection: GraphProjection,
): string[] {
	if (!previousProjection) {
		return nextProjection.nodes.map((node) => node.id);
	}
	const previousHidden = previousProjection.hiddenNodeIds ?? new Set();
	const nextHidden = nextProjection.hiddenNodeIds ?? new Set();
	const changed = new Set<string>();
	for (const nodeId of previousHidden) {
		if (!nextHidden.has(nodeId)) {
			changed.add(nodeId);
		}
	}
	for (const nodeId of nextHidden) {
		if (!previousHidden.has(nodeId)) {
			changed.add(nodeId);
		}
	}
	return [...changed];
}
