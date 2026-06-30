<script lang="ts">
	import ObsidianButton from "../obsidian/ObsidianButton.svelte";
	import ObsidianDropdown from "../obsidian/ObsidianDropdown.svelte";
	import type { DropdownOption } from "../obsidian/ObsidianDropdown.svelte";
	import type { CuratedFileEntry } from "./curated-panel-state";

	let {
		files,
		selectedTitleCounts,
		activeDraggingPath,
		getGroupOptions,
		onToggleSelected,
		onPointerDown,
		onOpenNote,
		onSelectNote,
		onMoveFileToGroup,
		onRemoveFile,
	}: {
		files: CuratedFileEntry[];
		selectedTitleCounts: Record<string, number>;
		activeDraggingPath?: string;
		getGroupOptions: (currentGroupId: string) => DropdownOption[];
		onToggleSelected: (path: string) => void;
		onPointerDown: (path: string, event: PointerEvent) => void;
		onOpenNote: (path: string) => void;
		onSelectNote: (path: string) => void;
		onMoveFileToGroup: (path: string, groupId: string) => void;
		onRemoveFile: (path: string) => void;
	} = $props();
</script>

<div class="knowledge-workspace-curated-list">
	{#each files as file (file.path)}
		<div
			class="knowledge-workspace-curated-file"
			class:dragging={activeDraggingPath === file.path}
			class:missing={file.missing}
			class:selected={file.selected}
			data-curated-file-path={file.path}
			role="button"
			tabindex="0"
			aria-label={file.missing ? `${file.title} (file not found)` : file.title}
			title={file.missing ? `File not found: ${file.path}` : undefined}
			onpointerdown={(event) => onPointerDown(file.path, event)}
			ondblclick={file.missing ? undefined : () => onOpenNote(file.path)}
			onkeydown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelectNote(file.path);
				}
			}}
		>
			<input
				type="checkbox"
				aria-label={`Select ${file.title}`}
				checked={file.selected}
				onclick={(event) => event.stopPropagation()}
				onchange={() => onToggleSelected(file.path)}
			/>
			<span
				style={file.missing
					? undefined
					: `background: ${file.color ?? 'var(--color-green, #44a37f)'}`}
			></span>
			<div class="knowledge-workspace-curated-file-title">
				<strong>{file.title}</strong>
				{#if (selectedTitleCounts[file.title] ?? 0) > 1}
					<span class="knowledge-workspace-curated-file-path">{file.detail}</span>
				{/if}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					class="knowledge-workspace-curated-file-group"
					class:missing={file.missingGroup}
					role="group"
					onclick={(event) => event.stopPropagation()}
					onkeydown={(event) => event.stopPropagation()}
					onpointerdown={(event) => event.stopPropagation()}
				>
					<span
						style={file.groupColor ? `background: ${file.groupColor}` : undefined}
						aria-hidden="true"
					></span>
					<ObsidianDropdown
						class="knowledge-workspace-curated-group-select"
						value={file.groupId}
						options={getGroupOptions(file.groupId)}
						ariaLabel={`Group for ${file.title}`}
						onChange={(value) => onMoveFileToGroup(file.path, value)}
					/>
				</div>
			</div>
			<ObsidianButton
				ariaLabel={`Open ${file.title}`}
				icon="file-text"
				disabled={file.missing}
				onClick={(event) => {
					event.stopPropagation();
					onOpenNote(file.path);
				}}
			/>
			<ObsidianButton
				ariaLabel={`Remove ${file.title}`}
				icon="x"
				onClick={(event) => {
					event.stopPropagation();
					onRemoveFile(file.path);
				}}
			/>
		</div>
	{:else}
		<span class="knowledge-workspace-curated-empty">No workspace files</span>
	{/each}
</div>
