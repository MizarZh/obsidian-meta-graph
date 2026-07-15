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
	import type { DockDragPayload } from '../dock/types';
	import type { CuratedConditionDraft } from '../curated/curated-panel-state';
	import type { DockCuratedDropPreview } from './dock-curated-drop';
	import type { DockNoteEntry } from './derived';
	import { resolveConnectionPreviewStyle } from './connection-preview-style';

	let {
		app,
		controller,
		workspaceState,
		debugSnapshot,
		workspaceFilePath,
		nodeColors,
		dockNoteEntries,
		selectedNode,
		selectedNodeColor,
		atNodeLimit,
		metadataFieldSuggestions,
		connectionDrag,
		graphConnectionTargetNotePath,
		graphConnectionTargetTemplateId,
		graphConnectionTargetCurated,
		curatedSelection,
		curatedConditionDraft,
		dockDrag,
		dockCuratedDropPreview,
		dockConnectionDrag,
		dockTargetNodeId,
		previewNodeId,
		dockOpen,
		curatedPanelOpen,
		connectionOpen,
		onToggleDock,
		onToggleCuratedPanel,
		onToggleConnection,
		onLinkPointerDown,
		onCuratedPointerDown,
		onCreateTemplateNote,
		onFocusNode,
		onOpenNote,
		onPreviewNote,
		onClosePreview,
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
		selectedNode?: KnowledgeNode;
		selectedNodeColor?: string;
		atNodeLimit: boolean;
		metadataFieldSuggestions: string[];
		connectionDrag?: ConnectionDragState;
		graphConnectionTargetNotePath?: string;
		graphConnectionTargetTemplateId?: string;
		graphConnectionTargetCurated: boolean;
		curatedSelection: Set<string>;
		curatedConditionDraft: CuratedConditionDraft;
		dockDrag?: DockDragPayload;
		dockCuratedDropPreview?: DockCuratedDropPreview;
		dockConnectionDrag?: DockDragPayload;
		dockTargetNodeId?: string;
		previewNodeId?: string;
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
		onCuratedPointerDown: (
			payload: DockDragPayload,
			event: PointerEvent,
		) => boolean;
		onCreateTemplateNote: (templateId: string, label: string) => void;
		onFocusNode: (nodeId: string) => void;
		onOpenNote: (nodeId: string) => void;
		onPreviewNote: (nodeId: string) => void;
		onClosePreview: () => void;
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

	const connectionPreviewLineStyle = $derived.by(() => {
		if (!connectionDrag) {
			return '';
		}
		const style = resolveConnectionPreviewStyle(
			workspaceState,
			connectionDrag.sourceNodeId,
			connectionDrag.targetNodeId,
		);
		const dashArray =
			style.lineStyle === 'dashed'
				? '10 7'
				: style.lineStyle === 'dotted'
					? '2 5'
					: 'none';
		return [
			`stroke: ${style.color}`,
			`stroke-width: ${style.size}px`,
			`stroke-dasharray: ${dashArray}`,
			`visibility: ${style.hidden ? 'hidden' : 'visible'}`,
		].join('; ');
	});
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
		onAddFiles={(paths, groupId) =>
			controller.addCuratedFiles(paths, groupId)}
		onRemoveFile={(path) => controller.removeCuratedFile(path)}
		onRemoveFiles={(paths) => controller.removeCuratedFiles(paths)}
		onSetFilesHidden={(paths, hidden) =>
			controller.setCuratedFilesHidden(paths, hidden)}
		onMoveFilesToGroup={(paths, groupId) =>
			controller.moveCuratedFilesToGroup(paths, groupId)}
		onClearFiles={() => controller.clearCuratedFiles()}
		onReorderFiles={(paths) => controller.reorderCuratedFiles(paths)}
		{onOpenNote}
		onSelectNote={selectAndMaybeFocusNode}
	/>
{/if}
{#if connectionDrag}
	<svg class="knowledge-workspace-connection-preview" aria-hidden="true">
		<line
			style={connectionPreviewLineStyle}
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
{#if dockCuratedDropPreview}
	<div
		class="knowledge-workspace-curated-drop-preview"
		class:target={Boolean(dockCuratedDropPreview.groupId)}
		style={`--drop-x: ${dockCuratedDropPreview.x}px; --drop-y: ${dockCuratedDropPreview.y}px;`}
		aria-hidden="true"
	>
		<span></span>
	</div>
{/if}
<DockGraphPanel
	{app}
	templates={workspaceState.dock.templates}
	notes={dockNoteEntries}
	nodes={debugSnapshot.index.nodes}
	groups={workspaceState.manualLayout.groups}
	folders={workspaceState.availableFolders}
	{workspaceFilePath}
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
	{selectedNode}
	{selectedNodeColor}
	mode={workspaceState.mode}
	manualLayout={workspaceState.manualLayout}
	{previewNodeId}
	onAddTemplate={(template) => controller.addDockTemplate(template)}
	onUpdateTemplate={(templateId, template) =>
		controller.updateDockTemplate(templateId, template)}
	onRemoveTemplate={(templateId) => controller.removeDockTemplate(templateId)}
	onAddNotes={(paths) => controller.addDockNotes(paths)}
	onRemoveNote={(path) => controller.removeDockNote(path)}
	onReorderTemplates={(templateIds) =>
		controller.reorderDockTemplates(templateIds)}
	onReorderNotes={(paths) => controller.reorderDockNotes(paths)}
	{onLinkPointerDown}
	{onCuratedPointerDown}
	{onCreateTemplateNote}
	{onOpenNote}
	{onPreviewNote}
	{onClosePreview}
	{onOpenMetadataLink}
	onSetNodeGroup={(path, groupId) => controller.setNodeGroup(path, groupId)}
	onConnectNode={(sourcePath, targetPath, field) => {
		void controller
			.connectNodes(sourcePath, targetPath, field)
			.catch(reportError);
	}}
	onSelectNote={selectAndMaybeFocusNode}
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
