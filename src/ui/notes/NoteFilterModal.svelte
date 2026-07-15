<script lang="ts">
	import type { App } from 'obsidian';
	import type { KnowledgeNode } from '../../core/types';
	import {
		createConditionFilterRoot,
		type CuratedConditionDraft,
	} from '../curated/curated-panel-state';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import WorkspaceModal from '../WorkspaceModal.svelte';
	import NoteFilterEditor from './NoteFilterEditor.svelte';

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

<WorkspaceModal {open} title="Filter workspace files" compact={true} {onClose}>
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
					filterRoot: createConditionFilterRoot(),
				})}
		/>
		<ObsidianButton text="Done" cta={true} onClick={onClose} />
	</div>
</WorkspaceModal>
