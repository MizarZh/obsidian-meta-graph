<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		ChartGroupDefinition,
		ChartGroupingConfig,
		DockTemplateNode,
		KnowledgeNode,
		ManualLayoutConfig,
		ViewMode,
	} from '../core/types';
	import type { DockDragPayload } from './dock/types';
	import DockNotesSection from './dock-panel/DockNotesSection.svelte';
	import DockResizeHandle from './dock-panel/DockResizeHandle.svelte';
	import DockTemplateSection from './dock-panel/DockTemplateSection.svelte';
	import {
		buildGroupOptions,
		buildNoteOptions,
		buildTargetFolderOptions,
		buildTemplateEntries,
		countTitles,
		type DockNoteEntry,
	} from './dock-panel/dock-panel-state';
	import { createCuratedConditionDraft } from './curated/curated-panel-state';
	import Inspector from './Inspector.svelte';
	import AddNotesModal from './notes/AddNotesModal.svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';

	type RightPanelTab = 'details' | 'pinned' | 'templates';

	let {
		app,
		templates,
		notes,
		nodes,
		groups,
		folders,
		workspaceFilePath,
		nodeColors,
		dockOpen,
		onToggleDock,
		dockWidth,
		onResizeDock,
		activeConnectionField,
		draggingKey,
		linking,
		targetNodeId,
		graphTargetNotePath,
		graphTargetTemplateId,
		selectedNode,
		selectedNodeColor,
		mode,
		manualLayout,
		grouping,
		onAddTemplate,
		onUpdateTemplate,
		onRemoveTemplate,
		onAddNotes,
		onRemoveNote,
		onReorderTemplates,
		onReorderNotes,
		onLinkPointerDown,
		onCuratedPointerDown,
		onCreateTemplateNote,
		onOpenNote,
		onOpenMetadataLink,
		onSetNodeGroup,
		onConnectNode,
		onSelectNote,
		focusOnSelect,
		onToggleFocusOnSelect,
	}: {
		app: App;
		templates: DockTemplateNode[];
		notes: DockNoteEntry[];
		nodes: KnowledgeNode[];
		groups: ChartGroupDefinition[];
		folders: string[];
		workspaceFilePath?: string;
		nodeColors: Map<string, string>;
		dockOpen: boolean;
		onToggleDock: () => void;
		dockWidth: number;
		onResizeDock: (width: number) => void;
		activeConnectionField: string;
		draggingKey?: string;
		linking: boolean;
		targetNodeId?: string;
		graphTargetNotePath?: string;
		graphTargetTemplateId?: string;
		selectedNode?: KnowledgeNode;
		selectedNodeColor?: string;
		mode: ViewMode;
		manualLayout: ManualLayoutConfig;
		grouping: ChartGroupingConfig;
		onAddTemplate: (template: Omit<DockTemplateNode, 'id'>) => void;
		onUpdateTemplate: (
			templateId: string,
			template: Omit<DockTemplateNode, 'id'>,
		) => void;
		onRemoveTemplate: (templateId: string) => void;
		onAddNotes: (paths: string[]) => void;
		onRemoveNote: (path: string) => void;
		onReorderTemplates: (templateIds: string[]) => void;
		onReorderNotes: (paths: string[]) => void;
		onLinkPointerDown: (
			payload: DockDragPayload,
			event: PointerEvent,
		) => void;
		onCuratedPointerDown: (
			payload: DockDragPayload,
			event: PointerEvent,
		) => boolean;
		onCreateTemplateNote: (templateId: string, label: string) => void;
		onOpenNote: (nodeId: string) => void;
		onOpenMetadataLink: (linkText: string, sourcePath: string) => void;
		onSetNodeGroup: (path: string, groupId?: string | null) => void;
		onConnectNode: (
			sourcePath: string,
			targetPath: string,
			field: string,
		) => void;
		onSelectNote: (nodeId: string) => void;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
	} = $props();

	let activeTab = $state<RightPanelTab>('details');
	let detailsContentVisible = $state(false);
	let addNotesOpen = $state(false);
	let addNotesDraft = $state(createCuratedConditionDraft());

	const activeDraggingKey = $derived(draggingKey);
	const notesTitleCounts = $derived(countTitles(notes));
	const titleCounts = $derived(countTitles(nodes));
	const noteOptions = $derived(buildNoteOptions(nodes, titleCounts));
	const targetFolderOptions = $derived.by(() => {
		void nodes;
		return buildTargetFolderOptions(app);
	});
	const groupOptions = $derived(buildGroupOptions(groups));
	const templateEntries = $derived(buildTemplateEntries(app, templates));
	const pinnedPaths = $derived(new Set(notes.map((note) => note.path)));

	function handleNodePointerDown(
		payload: DockDragPayload,
		event: PointerEvent,
	): void {
		if (
			event.target instanceof Element &&
			event.target.closest(
				'button, input, .knowledge-workspace-drag-handle',
			)
		) {
			return;
		}
		if (payload.kind === 'broken-note') return;
		if (event.ctrlKey || event.metaKey) {
			startConnection(payload, event);
			return;
		}
		onCuratedPointerDown(payload, event);
		if (payload.kind === 'note') onSelectNote(payload.notePath);
	}

	function startConnection(
		payload: DockDragPayload,
		event: PointerEvent,
	): void {
		if (event.button !== 0 || payload.kind === 'broken-note') return;
		event.preventDefault();
		event.stopPropagation();
		onLinkPointerDown(payload, event);
	}
</script>

<aside
	class="knowledge-workspace-dock-panel"
	class:knowledge-workspace-dock-panel-collapsed={!dockOpen}
	style="width: {dockOpen ? `${dockWidth}px` : undefined}"
>
	<DockResizeHandle
		width={dockWidth}
		minWidth={260}
		maxWidth={520}
		ariaLabel="Resize right panel"
		class="knowledge-workspace-dock-resize-handle"
		readDelta={(startX, currentX) => startX - currentX}
		onResize={onResizeDock}
	/>
	<ObsidianButton
		class="knowledge-workspace-dock-toggle"
		icon={dockOpen ? 'panel-right-close' : 'panel-right-open'}
		ariaLabel={dockOpen ? 'Close right panel' : 'Open right panel'}
		onClick={onToggleDock}
	/>
	{#if dockOpen}
		<div class="knowledge-workspace-dock-tabs" role="tablist">
			<ObsidianButton
				text="Details"
				active={activeTab === 'details'}
				role="tab"
				onClick={() => (activeTab = 'details')}
			/>
			<ObsidianButton
				text="Pinned notes"
				active={activeTab === 'pinned'}
				role="tab"
				onClick={() => (activeTab = 'pinned')}
			/>
			<ObsidianButton
				text="Templates"
				active={activeTab === 'templates'}
				role="tab"
				onClick={() => (activeTab = 'templates')}
			/>
		</div>
		{#if activeTab === 'details'}
			<div class="knowledge-workspace-details-tab">
				{#if selectedNode}
					<Inspector
						{app}
						node={selectedNode}
						{nodes}
						nodeColor={selectedNodeColor}
						{mode}
						{manualLayout}
						{grouping}
						{activeConnectionField}
						contentVisible={detailsContentVisible}
						{onOpenNote}
						{onOpenMetadataLink}
						{onSetNodeGroup}
						{onConnectNode}
						onContentVisibleChange={(visible) =>
							(detailsContentVisible = visible)}
					/>
				{:else}
					<div class="knowledge-workspace-dock-empty">
						Select a node
					</div>
				{/if}
			</div>
		{:else if activeTab === 'pinned'}
			<DockNotesSection
				{notes}
				{notesTitleCounts}
				{activeConnectionField}
				{activeDraggingKey}
				{graphTargetNotePath}
				{focusOnSelect}
				{onToggleFocusOnSelect}
				onOpenPicker={() => (addNotesOpen = true)}
				{onRemoveNote}
				onPointerDown={handleNodePointerDown}
				onLinkPointerDown={startConnection}
				{onReorderNotes}
				{onOpenNote}
			/>
		{:else}
			<DockTemplateSection
				{app}
				templates={templateEntries}
				{noteOptions}
				{targetFolderOptions}
				{groupOptions}
				{activeConnectionField}
				{activeDraggingKey}
				{graphTargetTemplateId}
				{onAddTemplate}
				{onUpdateTemplate}
				{onRemoveTemplate}
				onPointerDown={handleNodePointerDown}
				onLinkPointerDown={startConnection}
				{onCreateTemplateNote}
				{onReorderTemplates}
				{onOpenNote}
			/>
		{/if}
		{#if linking || draggingKey}
			<span
				class:active={linking}
				class:target={Boolean(
					targetNodeId ||
					graphTargetNotePath ||
					graphTargetTemplateId,
				)}
				class="knowledge-workspace-dock-status"
			>
				{targetNodeId || graphTargetNotePath || graphTargetTemplateId
					? 'Release to connect'
					: linking
						? 'Choose target'
						: 'Drop on graph'}
			</span>
		{/if}
	{/if}
</aside>

<AddNotesModal
	{app}
	open={addNotesOpen}
	{nodes}
	existingPaths={pinnedPaths}
	{nodeColors}
	{folders}
	{workspaceFilePath}
	draft={addNotesDraft}
	existingLabel="Pinned"
	onDraftChange={(draft) => (addNotesDraft = draft)}
	onAddFiles={(paths) => onAddNotes(paths)}
	onClose={() => (addNotesOpen = false)}
/>
