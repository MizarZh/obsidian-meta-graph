<script lang="ts">
	import ObsidianButton from "../obsidian/ObsidianButton.svelte";
	import ObsidianDropdown from "../obsidian/ObsidianDropdown.svelte";
	import type { DropdownOption } from "../obsidian/ObsidianDropdown.svelte";

	let {
		open,
		input,
		status,
		groupId,
		groupOptions,
		onToggle,
		onInput,
		onAdd,
		onGroupChange,
	}: {
		open: boolean;
		input: string;
		status: string;
		groupId: string;
		groupOptions: DropdownOption[];
		onToggle: () => void;
		onInput: (value: string) => void;
		onAdd: () => void;
		onGroupChange: (value: string) => void;
	} = $props();
</script>

<div class="knowledge-workspace-curated-batch-header">
	<ObsidianButton
		icon={open ? "chevron-down" : "chevron-right"}
		ariaLabel={open ? "Collapse batch add" : "Expand batch add"}
		onClick={onToggle}
	/>
	<h3>Batch add</h3>
	<span>{status}</span>
</div>
{#if open}
	<textarea
		class="knowledge-workspace-curated-batch"
		placeholder="One path or [[wikilink]] per line"
		aria-label="Batch add workspace files"
		value={input}
		oninput={(event) => {
			if (event.currentTarget instanceof HTMLTextAreaElement) {
				onInput(event.currentTarget.value);
			}
		}}
	></textarea>
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
{/if}
