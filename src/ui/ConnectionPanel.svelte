<script lang="ts">
	import type { App } from 'obsidian';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianSuggestInput from './obsidian/ObsidianSuggestInput.svelte';

	let {
		app,
		fields,
		metadataFieldSuggestions,
		activeField,
		dragging,
		dragTarget,
		undoCount,
		onSelectField,
		onAddField,
		onRemoveField,
		onUndo,
	}: {
		app: App;
		fields: string[];
		metadataFieldSuggestions: string[];
		activeField: string;
		dragging: boolean;
		dragTarget?: string;
		undoCount: number;
		onSelectField: (field: string) => void;
		onAddField: (field: string) => void;
		onRemoveField: (field: string) => void;
		onUndo: () => void;
	} = $props();
	let fieldInput = $state('');
	const customField = $derived(fieldInput.trim());
	const metadataFieldOptions = $derived(
		metadataFieldSuggestions.map((field) => ({
			value: field,
			label: field,
			searchText: field,
		})),
	);

	function addField(): void {
		if (!customField) {
			return;
		}
		onAddField(customField);
		fieldInput = '';
	}
</script>

<section class="knowledge-workspace-connection-panel">
	<div class="knowledge-workspace-connection-picker">
		<span class="knowledge-workspace-connection-label">Connection</span>
		<div class="knowledge-workspace-connection-tags" aria-label="Connection metadata fields">
			{#each fields as field}
				<span
					class:active={field === activeField}
					class="knowledge-workspace-connection-tag"
				>
					<button
						type="button"
						aria-pressed={field === activeField}
						onclick={() => onSelectField(field)}
					>
						<span>{field}</span>
					</button>
					<ObsidianButton
						icon="x"
						ariaLabel={`Remove ${field}`}
						onClick={() => onRemoveField(field)}
					/>
				</span>
			{/each}
			{#if fields.length === 0}
				<span class="knowledge-workspace-connection-empty">No metadata</span>
			{/if}
		</div>
	</div>
	<form
		class="knowledge-workspace-connection-custom"
		onsubmit={(event) => {
			event.preventDefault();
			addField();
		}}
	>
		<ObsidianSuggestInput
			{app}
			type="text"
			placeholder="Custom metadata"
			ariaLabel="Custom connection metadata"
			value={fieldInput}
			options={metadataFieldOptions}
			onInput={(value) => {
				fieldInput = value;
				const normalized = value.trim();
				if (normalized) {
					onSelectField(normalized);
				}
			}}
			onSelect={(option) => {
				fieldInput = option.value;
				onSelectField(option.value);
			}}
		/>
		<ObsidianButton
			icon="plus"
			ariaLabel="Pin metadata field"
			disabled={!customField}
			onClick={addField}
		/>
	</form>
	<span
		class:active={dragging}
		class:target={Boolean(dragTarget)}
		class="knowledge-workspace-connection-status"
	>
		{dragTarget ? 'Release to connect' : dragging ? 'Choose target' : 'Ctrl drag'}
	</span>
	<ObsidianButton
		class="knowledge-workspace-connection-undo"
		disabled={undoCount === 0}
		ariaLabel="Undo last connection"
		text={`Undo${undoCount > 0 ? ` (${undoCount})` : ''}`}
		onClick={onUndo}
	/>
</section>
