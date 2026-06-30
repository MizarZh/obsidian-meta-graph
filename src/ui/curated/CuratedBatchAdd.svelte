<script lang="ts">
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import type { DropdownOption } from '../obsidian/ObsidianDropdown.svelte';
	import WorkspaceModal from '../WorkspaceModal.svelte';

	let {
		open,
		input,
		status,
		groupId,
		groupOptions,
		onOpen,
		onClose,
		onInput,
		onAdd,
		onGroupChange,
	}: {
		open: boolean;
		input: string;
		status: string;
		groupId: string;
		groupOptions: DropdownOption[];
		onOpen: () => void;
		onClose: () => void;
		onInput: (value: string) => void;
		onAdd: () => void;
		onGroupChange: (value: string) => void;
	} = $props();
</script>

<ObsidianButton text="Batch add" icon="list-plus" onClick={onOpen} />
{#if status}
	<span class="knowledge-workspace-curated-status">{status}</span>
{/if}

<WorkspaceModal {open} title="Batch add" subtitle={status} onClose={onClose}>
	<textarea
		class="knowledge-workspace-curated-batch"
		placeholder="One path or [[wikilink]] per line"
		aria-label="Batch add workspace files"
		value={input}
		oninput={(event) => {
			if (event.currentTarget instanceof HTMLTextAreaElement) {
				onInput(event.currentTarget.value);
			}
		}}></textarea>
	<div class="knowledge-workspace-curated-actions">
		<ObsidianButton
			text="Add all"
			icon="plus"
			disabled={!input.trim()}
			onClick={onAdd}
		/>
		<ObsidianDropdown
			value={groupId}
			options={groupOptions}
			ariaLabel="Group for added files"
			onChange={onGroupChange}
		/>
	</div>
</WorkspaceModal>
