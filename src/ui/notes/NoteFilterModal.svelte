<script lang="ts">
	import { createDefaultFilterRoot } from '@/ui/filter/filter-tree';
	import type { App } from 'obsidian';
	import type { KnowledgeNode } from '@/core/types';
	import { type CuratedConditionDraft } from '@/ui/curated/curated-panel-state';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import WorkspaceModal from '@/ui/WorkspaceModal.svelte';
	import NoteFilterEditor from '@/ui/notes/NoteFilterEditor.svelte';

	let {
		app,
		open,
		nodes,
		folders,
		draft,
		onDraftChange,
		onClose,
	}: {
		app: App;
		open: boolean;
		nodes: KnowledgeNode[];
		folders: string[];
		draft: CuratedConditionDraft;
		onDraftChange: (draft: CuratedConditionDraft) => void;
		onClose: () => void;
	} = $props();
</script>

<WorkspaceModal
	{open}
	title="Filter node list"
	subtitle="Only filters the Nodes list. The graph is unchanged."
	compact={true}
	{onClose}
>
	<NoteFilterEditor
		{app}
		{nodes}
		{folders}
		filterRoot={draft.filterRoot}
		onChange={(filterRoot) => onDraftChange({ ...draft, filterRoot })}
	/>
	<div class="knowledge-workspace-note-picker-actions">
		<ObsidianButton
			text="Clear filters"
			onClick={() =>
				onDraftChange({
					...draft,
					filterRoot: createDefaultFilterRoot(),
				})}
		/>
		<ObsidianButton text="Done" cta={true} onClick={onClose} />
	</div>
</WorkspaceModal>
