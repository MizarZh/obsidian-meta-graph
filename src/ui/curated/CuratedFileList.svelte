<script lang="ts">
	import {
		SHADOW_PLACEHOLDER_ITEM_ID,
		dragHandle,
		dragHandleZone,
		type DndEvent,
	} from 'svelte-dnd-action';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '../obsidian/ObsidianDropdown.svelte';
	import type { DropdownOption } from '../obsidian/ObsidianDropdown.svelte';
	import type { CuratedFileEntry } from './curated-panel-state';

	type CuratedDndEntry = CuratedFileEntry & { id: string };

	let {
		files,
		selectedTitleCounts,
		getGroupOptions,
		onToggleSelected,
		onPointerDown,
		onReorderFiles,
		onOpenNote,
		onSelectNote,
		onMoveFileToGroup,
		onSetFileHidden,
		onRemoveFile,
	}: {
		files: CuratedFileEntry[];
		selectedTitleCounts: Record<string, number>;
		getGroupOptions: (currentGroupId: string) => DropdownOption[];
		onToggleSelected: (path: string) => void;
		onPointerDown: (path: string, event: PointerEvent) => void;
		onReorderFiles: (paths: string[]) => void;
		onOpenNote: (path: string) => void;
		onSelectNote: (path: string) => void;
		onMoveFileToGroup: (path: string, groupId: string) => void;
		onSetFileHidden: (path: string, hidden: boolean) => void;
		onRemoveFile: (path: string) => void;
	} = $props();

	let dndFiles = $state<CuratedDndEntry[]>([]);

	$effect(() => {
		dndFiles = files.map((file) => ({ ...file, id: file.path }));
	});

	function handleDndConsider(event: CustomEvent<DndEvent<CuratedDndEntry>>) {
		dndFiles = readRealItems(event.detail.items);
	}

	function handleDndFinalize(event: CustomEvent<DndEvent<CuratedDndEntry>>) {
		dndFiles = readRealItems(event.detail.items);
		onReorderFiles(dndFiles.map((file) => file.path));
	}

	function readRealItems(items: CuratedDndEntry[]): CuratedDndEntry[] {
		return items.filter((item) => item.id !== SHADOW_PLACEHOLDER_ITEM_ID);
	}
</script>

{#if dndFiles.length === 0}
	<div class="knowledge-workspace-curated-list">
		<span class="knowledge-workspace-curated-empty">No workspace files</span
		>
	</div>
{:else}
	<div
		class="knowledge-workspace-curated-list"
		aria-label="Workspace files"
		use:dragHandleZone={{
			items: dndFiles,
			flipDurationMs: 120,
			type: 'meta-graph-curated-files',
		}}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
	>
		{#each dndFiles as file (file.id)}
			<div
				class="knowledge-workspace-curated-file"
				class:missing={file.missing}
				class:hidden={file.hidden}
				class:selected={file.selected}
				data-curated-file-path={file.path}
				role="button"
				tabindex="0"
				aria-label={file.missing
					? `${file.title} (file not found)`
					: file.title}
				title={file.missing
					? `File not found: ${file.path}`
					: undefined}
				onpointerdown={(event) => onPointerDown(file.path, event)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onSelectNote(file.path);
					}
				}}
			>
				<span
					class="knowledge-workspace-drag-handle"
					aria-label={`Drag ${file.title}`}
					use:dragHandle
				></span>
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
						<span class="knowledge-workspace-curated-file-path"
							>{file.detail}</span
						>
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
							style={file.groupColor
								? `background: ${file.groupColor}`
								: undefined}
							aria-hidden="true"
						></span>
						<ObsidianDropdown
							class="knowledge-workspace-curated-group-select"
							value={file.groupId}
							options={getGroupOptions(file.groupId)}
							ariaLabel={`Group for ${file.title}`}
							onChange={(value) =>
								onMoveFileToGroup(file.path, value)}
						/>
					</div>
				</div>
				<ObsidianButton
					ariaLabel={file.hidden
						? `Show ${file.title}`
						: `Hide ${file.title}`}
					icon={file.hidden ? 'eye-off' : 'eye'}
					tooltip={file.hidden ? 'Show in graph' : 'Hide from graph'}
					onClick={(event) => {
						event.stopPropagation();
						onSetFileHidden(file.path, !file.hidden);
					}}
				/>
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
		{/each}
	</div>
{/if}
