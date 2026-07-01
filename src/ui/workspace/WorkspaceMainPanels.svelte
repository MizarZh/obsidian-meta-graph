<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		DebugSnapshot,
		KnowledgeNode,
		WorkspaceState,
	} from '../../core/types';
	import type { ConnectionDragState } from '../../graph/renderers/renderer-events';
	import { withAlpha } from '../../graph/styles/graph-styles';
	import type { WorkspaceController } from '../../workspace/workspace-controller';
	import ConnectionPanel from '../ConnectionPanel.svelte';
	import CuratedPanel from '../CuratedPanel.svelte';
	import DockGraphPanel from '../DockGraphPanel.svelte';
	import Inspector from '../Inspector.svelte';
	import type { DockDragPayload } from '../dock/types';
	import type { CuratedConditionDraft } from '../curated/curated-panel-state';
	import type { DockNoteEntry } from './derived';

	let {
		app,
		controller,
		workspaceState,
		debugSnapshot,
		workspaceFilePath,
		nodeColors,
		dockNoteEntries,
		dockNoteCandidates,
		selectedNode,
		selectedNodeColor,
		searchableNodes,
		atNodeLimit,
		metadataFieldSuggestions,
		connectionDrag,
		graphConnectionTargetNotePath,
		graphConnectionTargetTemplateId,
		graphConnectionTargetCurated,
		curatedSelection,
		curatedConditionDraft,
		dockDrag,
		dockConnectionDrag,
		dockTargetNodeId,
		dockOpen,
		curatedPanelOpen,
		connectionOpen,
		onToggleDock,
		onToggleCuratedPanel,
		onToggleConnection,
		onLinkPointerDown,
		onFocusNode,
		onOpenMetadataLink,
		onCuratedSelectionChange,
		onCuratedConditionDraftChange,
		formatError,
	}: {
		app: App;
		controller: WorkspaceController;
		workspaceState: WorkspaceState;
		debugSnapshot: DebugSnapshot;
		workspaceFilePath?: string;
		nodeColors: Map<string, string>;
		dockNoteEntries: DockNoteEntry[];
		dockNoteCandidates: KnowledgeNode[];
		selectedNode?: KnowledgeNode;
		selectedNodeColor?: string;
		searchableNodes: KnowledgeNode[];
		atNodeLimit: boolean;
		metadataFieldSuggestions: string[];
		connectionDrag?: ConnectionDragState;
		graphConnectionTargetNotePath?: string;
		graphConnectionTargetTemplateId?: string;
		graphConnectionTargetCurated: boolean;
		curatedSelection: Set<string>;
		curatedConditionDraft: CuratedConditionDraft;
		dockDrag?: DockDragPayload;
		dockConnectionDrag?: DockDragPayload;
		dockTargetNodeId?: string;
		dockOpen: boolean;
		curatedPanelOpen: boolean;
		connectionOpen: boolean;
		onToggleDock: () => void;
		onToggleCuratedPanel: () => void;
		onToggleConnection: () => void;
		onLinkPointerDown: (
			payload: DockDragPayload,
			event: PointerEvent,
		) => void;
		onFocusNode: (nodeId: string) => void;
		onOpenMetadataLink: (linkText: string, sourcePath: string) => void;
		onCuratedSelectionChange: (paths: Set<string>) => void;
		onCuratedConditionDraftChange: (draft: CuratedConditionDraft) => void;
		formatError: (error: unknown) => string;
	} = $props();

	function selectAndMaybeFocusNode(nodeId: string): void {
		controller.selectNode(nodeId);
		if (workspaceState.dock.focusOnSelect) {
			window.requestAnimationFrame(() => onFocusNode(nodeId));
		}
	}

	function reportError(error: unknown): void {
		controller.setRendererDebugState({
			status: 'error',
			error: formatError(error),
		});
	}

	const connectionDragTargetLabel = $derived.by(() => {
		if (!connectionDrag?.targetNodeId) {
			return undefined;
		}
		const targetNode = workspaceState.projection?.nodes.find(
			(node) => node.id === connectionDrag.targetNodeId,
		);
		return targetNode?.title ?? connectionDrag.targetNodeId;
	});

	const connectionDragTargetLabelStyle = $derived(
		[
			`--connection-label-x: ${connectionDrag?.x2 ?? 0}px`,
			`--connection-label-y: ${connectionDrag?.y2 ?? 0}px`,
			`--connection-label-size: ${workspaceState.labelSize}px`,
			`--connection-label-light-text: ${workspaceState.labelLightTextColor}`,
			`--connection-label-light-bg: ${withAlpha(
				workspaceState.labelLightBackgroundColor,
				workspaceState.labelLightBackgroundOpacity,
			)}`,
			`--connection-label-dark-text: ${workspaceState.labelDarkTextColor}`,
			`--connection-label-dark-bg: ${withAlpha(
				workspaceState.labelDarkBackgroundColor,
				workspaceState.labelDarkBackgroundOpacity,
			)}`,
		].join('; '),
	);
</script>

{#if workspaceState.chartSource === 'curated'}
	<CuratedPanel
		{app}
		curated={workspaceState.curated}
		nodes={debugSnapshot.index.nodes}
		groups={workspaceState.manualLayout.groups}
		manualLayout={workspaceState.manualLayout}
		groupRequired={workspaceState.mode === 'cube'}
		folders={workspaceState.availableFolders}
		{nodeColors}
		{workspaceFilePath}
		panelOpen={curatedPanelOpen}
		onTogglePanel={onToggleCuratedPanel}
		panelWidth={workspaceState.dock.curatedPanelWidth}
		onResizePanel={(width) => controller.setCuratedPanelWidth(width)}
		focusOnSelect={workspaceState.dock.focusOnSelect}
		onToggleFocusOnSelect={() =>
			controller.setDockFocusOnSelect(!workspaceState.dock.focusOnSelect)}
		dropTarget={graphConnectionTargetCurated}
		selectedPaths={curatedSelection}
		onSelectedPathsChange={onCuratedSelectionChange}
		conditionDraft={curatedConditionDraft}
		onConditionDraftChange={onCuratedConditionDraftChange}
		onAddFile={(path, groupId) => controller.addCuratedFile(path, groupId)}
		onAddFiles={(paths, groupId) =>
			controller.addCuratedFiles(paths, groupId)}
		onRemoveFile={(path) => controller.removeCuratedFile(path)}
		onRemoveFiles={(paths) => controller.removeCuratedFiles(paths)}
		onMoveFilesToGroup={(paths, groupId) =>
			controller.moveCuratedFilesToGroup(paths, groupId)}
		onClearFiles={() => controller.clearCuratedFiles()}
		onReorderFile={(path, targetPath, placement) =>
			controller.reorderCuratedFile(path, targetPath, placement)}
		onOpenNote={(path) => void controller.openNode(path)}
		onSelectNote={selectAndMaybeFocusNode}
	/>
{/if}
{#if connectionDrag}
	<svg class="knowledge-workspace-connection-preview" aria-hidden="true">
		<line
			class:target={Boolean(
				connectionDrag.targetNodeId ||
				graphConnectionTargetNotePath ||
				graphConnectionTargetTemplateId ||
				graphConnectionTargetCurated,
			)}
			x1={connectionDrag.x1}
			y1={connectionDrag.y1}
			x2={connectionDrag.x2}
			y2={connectionDrag.y2}
		/>
	</svg>
	{#if connectionDragTargetLabel}
		<div
			class="knowledge-workspace-connection-target-label"
			style={connectionDragTargetLabelStyle}
		>
			{connectionDragTargetLabel}
		</div>
	{/if}
{/if}
{#if workspaceState.projection?.nodes.length === 0}
	<div class="knowledge-workspace-empty">
		No matching metadata relationships.
	</div>
{/if}
<DockGraphPanel
	{app}
	templates={workspaceState.dock.templates}
	notes={dockNoteEntries}
	availableNotes={dockNoteCandidates}
	groups={workspaceState.manualLayout.groups}
	{nodeColors}
	{dockOpen}
	{onToggleDock}
	dockWidth={workspaceState.dock.dockWidth}
	onResizeDock={(width) => controller.setDockWidth(width)}
	activeConnectionField={workspaceState.activeConnectionField}
	draggingKey={dockDrag
		? dockDrag.kind === 'template'
			? `template:${dockDrag.templateId}`
			: `note:${dockDrag.notePath}`
		: undefined}
	linking={Boolean(dockConnectionDrag)}
	targetNodeId={dockTargetNodeId}
	graphTargetNotePath={graphConnectionTargetNotePath}
	graphTargetTemplateId={graphConnectionTargetTemplateId}
	onAddTemplate={(template) => controller.addDockTemplate(template)}
	onUpdateTemplate={(templateId, template) =>
		controller.updateDockTemplate(templateId, template)}
	onRemoveTemplate={(templateId) => controller.removeDockTemplate(templateId)}
	onAddNote={(path) => controller.addDockNote(path)}
	onRemoveNote={(path) => controller.removeDockNote(path)}
	onReorderTemplate={(templateId, targetTemplateId, placement) =>
		controller.reorderDockTemplate(templateId, targetTemplateId, placement)}
	onReorderNote={(path, targetPath, placement) =>
		controller.reorderDockNote(path, targetPath, placement)}
	{onLinkPointerDown}
	onOpenNote={(nodeId) => void controller.openNode(nodeId)}
	focusOnSelect={workspaceState.dock.focusOnSelect}
	onToggleFocusOnSelect={() =>
		controller.setDockFocusOnSelect(!workspaceState.dock.focusOnSelect)}
	onSelectNote={selectAndMaybeFocusNode}
/>
<Inspector
	{app}
	node={selectedNode}
	nodes={searchableNodes}
	nodeColor={selectedNodeColor}
	mode={workspaceState.mode}
	manualLayout={workspaceState.manualLayout}
	activeConnectionField={workspaceState.activeConnectionField}
	onOpenNote={(path) => void controller.openNode(path)}
	onOpenMetadataLink={(linkText, sourcePath) =>
		onOpenMetadataLink(linkText, sourcePath)}
	onSetNodeGroup={(path, groupId) => controller.setNodeGroup(path, groupId)}
	onConnectNode={(sourcePath, targetPath, field) => {
		void controller
			.connectNodes(sourcePath, targetPath, field)
			.catch(reportError);
	}}
/>
{#if atNodeLimit}
	<section class="knowledge-workspace-notice">
		<span
			>Node limit ({workspaceState.query.maxNodes}) reached. Some notes
			may be hidden.</span
		>
	</section>
{/if}
<ConnectionPanel
	{app}
	fields={workspaceState.connectionFieldSpecs}
	{metadataFieldSuggestions}
	activeFieldSpecId={workspaceState.activeConnectionFieldSpecId}
	activeField={workspaceState.activeConnectionField}
	dragging={Boolean(connectionDrag)}
	dragTarget={connectionDrag?.targetNodeId}
	undoCount={workspaceState.connectionUndoCount}
	collapsed={!connectionOpen}
	onToggle={onToggleConnection}
	onSelectField={(field, mode) => {
		if (mode) {
			controller.setConnectionFieldMode(field, mode);
		}
		controller.setActiveConnectionField(field);
	}}
	onFieldMode={(field, mode) =>
		controller.setConnectionFieldMode(field, mode)}
	onAddField={(field) => controller.addConnectionField(field)}
	onRemoveField={(field) => controller.removeConnectionField(field)}
	onReorderField={(id, targetId, placement) =>
		controller.reorderConnectionField(id, targetId, placement)}
	onUndo={() => void controller.undoLastConnection().catch(reportError)}
/>
