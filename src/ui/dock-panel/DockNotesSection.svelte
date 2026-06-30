<script lang="ts">
	import type { App } from "obsidian";
	import type { DockDragPayload } from "../dock/types";
	import ObsidianButton from "../obsidian/ObsidianButton.svelte";
	import ObsidianSuggestInput from "../obsidian/ObsidianSuggestInput.svelte";
	import type { SuggestionOption } from "../obsidian/ObsidianSuggestInput.svelte";
	import {
		dragKey,
		noteDragPayload,
		type DockNoteEntry,
	} from "./dock-panel-state";

	let {
		app,
		notes,
		noteOptions,
		notesTitleCounts,
		activeConnectionField,
		activeDraggingKey,
		graphTargetNotePath,
		focusOnSelect,
		onToggleFocusOnSelect,
		onAddNote,
		onRemoveNote,
		onPointerDown,
		onOpenNote,
	}: {
		app: App;
		notes: DockNoteEntry[];
		noteOptions: SuggestionOption[];
		notesTitleCounts: Record<string, number>;
		activeConnectionField: string;
		activeDraggingKey?: string;
		graphTargetNotePath?: string;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
		onAddNote: (path: string) => void;
		onRemoveNote: (path: string) => void;
		onPointerDown: (payload: DockDragPayload, event: PointerEvent) => void;
		onOpenNote: (nodeId: string) => void;
	} = $props();

	let notesOpen = $state(true);
	let noteSearch = $state("");
</script>

<section class:knowledge-workspace-dock-section-collapsed={!notesOpen}>
	<header>
		<ObsidianButton
			icon={notesOpen ? "chevron-down" : "chevron-right"}
			ariaLabel={notesOpen ? "Collapse notes" : "Expand notes"}
			onClick={() => (notesOpen = !notesOpen)}
		/>
		<h3>Selected notes</h3>
		<span>{notes.length}</span>
		<ObsidianButton
			icon="crosshair"
			active={focusOnSelect}
			ariaLabel={focusOnSelect
				? "Auto-focus on click (enabled)"
				: "Auto-focus on click (disabled)"}
			tooltip="Auto-focus on click"
			class="knowledge-workspace-dock-focus-toggle"
			onClick={onToggleFocusOnSelect}
		/>
	</header>
	{#if notesOpen}
		<div class="knowledge-workspace-dock-search">
			<ObsidianSuggestInput
				{app}
				type="search"
				placeholder="Add note..."
				ariaLabel="Add selected note"
				value={noteSearch}
				options={noteOptions}
				onInput={(value) => {
					noteSearch = value;
				}}
				onSelect={(option) => {
					onAddNote(option.value);
					noteSearch = "";
				}}
			/>
		</div>
		<div class="knowledge-workspace-dock-list">
			{#if notes.length === 0}
				<span class="knowledge-workspace-dock-empty">No selected notes</span>
			{:else}
				{#each notes as entry (entry.path)}
					{@const payload = noteDragPayload(entry, activeConnectionField)}
					<div
						class:dragging={activeDraggingKey === dragKey(payload)}
						class:target={!entry.broken && graphTargetNotePath === entry.path}
						class="knowledge-workspace-dock-node note"
						class:broken={entry.broken}
						data-dock-note-path={entry.path}
						role="button"
						tabindex="0"
						aria-label={entry.broken
							? `${entry.title} (file not found)`
							: entry.title}
						title={entry.broken ? `File not found: ${entry.path}` : undefined}
						onpointerdown={(event) => onPointerDown(payload, event)}
						ondblclick={entry.broken ? undefined : () => onOpenNote(entry.id)}
					>
						<span
							style={entry.broken
								? undefined
								: `background: ${entry.color ?? 'var(--color-green, #44a37f)'}`}
						></span>
						<div class="knowledge-workspace-dock-node-title">
							<strong>{entry.title}</strong>
							{#if (notesTitleCounts[entry.title] ?? 0) > 1}
								<span class="knowledge-workspace-dock-node-path">{entry.path}</span>
							{/if}
						</div>
						<ObsidianButton
							icon="file-text"
							ariaLabel={`Open ${entry.title}`}
							disabled={entry.broken}
							onClick={() => onOpenNote(entry.path)}
						/>
						<ObsidianButton
							icon="x"
							ariaLabel={`Remove ${entry.title}`}
							onClick={() => onRemoveNote(entry.path)}
						/>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</section>
