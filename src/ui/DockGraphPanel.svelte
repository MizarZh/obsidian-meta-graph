<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		ChartGroup,
		DockTemplateNode,
		KnowledgeNode,
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
		dragKey,
		type DockNoteEntry,
	} from './dock-panel/dock-panel-state';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';

	let {
		app,
		templates,
		notes,
		availableNotes,
		groups,
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
		onAddTemplate,
		onUpdateTemplate,
		onRemoveTemplate,
		onAddNote,
		onRemoveNote,
		onReorderTemplates,
		onReorderNotes,
		onLinkPointerDown,
		onCuratedPointerDown,
		onOpenNote,
		onSelectNote,
		focusOnSelect,
		onToggleFocusOnSelect,
	}: {
		app: App;
		templates: DockTemplateNode[];
		notes: DockNoteEntry[];
		availableNotes: KnowledgeNode[];
		groups: ChartGroup[];
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
		onAddTemplate: (template: Omit<DockTemplateNode, 'id'>) => void;
		onUpdateTemplate: (
			templateId: string,
			template: Omit<DockTemplateNode, 'id'>,
		) => void;
		onRemoveTemplate: (templateId: string) => void;
		onAddNote: (path: string) => void;
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
		onOpenNote: (nodeId: string) => void;
		onSelectNote: (nodeId: string) => void;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
	} = $props();

	const activeDraggingKey = $derived(draggingKey);
	const notesTitleCounts = $derived(countTitles(notes));
	const titleCounts = $derived(countTitles(availableNotes));
	const noteOptions = $derived(buildNoteOptions(availableNotes, titleCounts));
	const targetFolderOptions = $derived.by(() => {
		// Reference availableNotes so this re-runs when the graph refreshes.
		void availableNotes;
		return buildTargetFolderOptions(app);
	});
	const groupOptions = $derived(buildGroupOptions(groups));
	const templateEntries = $derived(buildTemplateEntries(app, templates));

	function handleNodePointerDown(
		payload: DockDragPayload,
		event: PointerEvent,
	): void {
		if (
			event.target instanceof HTMLElement &&
			event.target.closest('button, .knowledge-workspace-drag-handle')
		) {
			return;
		}
		if (payload.kind === 'broken-note') {
			if (event.ctrlKey) return;
		} else if (event.ctrlKey) {
			handleLinkPointerDown(payload, event);
			return;
		}
		onCuratedPointerDown(payload, event);
		if (payload.kind === 'note') {
			onSelectNote(payload.notePath);
		}
	}

	function handleLinkPointerDown(
		payload: DockDragPayload,
		event: PointerEvent,
	): void {
		if (
			!event.ctrlKey ||
			event.button !== 0 ||
			(event.target instanceof HTMLElement &&
				event.target.closest(
					'button, .knowledge-workspace-drag-handle',
				))
		) {
			return;
		}
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
		minWidth={180}
		maxWidth={480}
		ariaLabel="Resize dock"
		class="knowledge-workspace-dock-resize-handle"
		readDelta={(startX, currentX) => startX - currentX}
		onResize={onResizeDock}
	/>
	<ObsidianButton
		class="knowledge-workspace-dock-toggle"
		icon={dockOpen ? 'panel-right-close' : 'panel-right-open'}
		ariaLabel={dockOpen ? 'Close dock' : 'Open dock'}
		onClick={onToggleDock}
	/>
	{#if dockOpen}
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
			{onReorderTemplates}
			{onOpenNote}
		/>
		<DockNotesSection
			{app}
			{notes}
			{noteOptions}
			{notesTitleCounts}
			{activeConnectionField}
			{activeDraggingKey}
			{graphTargetNotePath}
			{focusOnSelect}
			{onToggleFocusOnSelect}
			{onAddNote}
			{onRemoveNote}
			onPointerDown={handleNodePointerDown}
			{onReorderNotes}
			{onOpenNote}
		/>
		<span
			class:active={linking}
			class:target={Boolean(
				targetNodeId || graphTargetNotePath || graphTargetTemplateId,
			)}
			class="knowledge-workspace-dock-status"
		>
			{targetNodeId || graphTargetNotePath || graphTargetTemplateId
				? 'Release to connect'
				: linking
					? 'Choose target'
					: draggingKey
						? 'Drop on graph'
						: 'Ready'}
		</span>
	{/if}
</aside>
