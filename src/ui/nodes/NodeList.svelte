<script lang="ts">
	import { untrack } from 'svelte';
	import {
		SHADOW_PLACEHOLDER_ITEM_ID,
		dragHandle,
		dragHandleZone,
		type DndEvent,
		type Options,
	} from 'svelte-dnd-action';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import type { DropdownOption } from '@/ui/obsidian/ObsidianDropdown.svelte';
	import { buildCuratedMultiDragOrder } from '@/ui/curated/curated-multi-drag';
	import type { NodeListEntry } from '@/ui/nodes/node-list-state';

	type CuratedDndEntry = NodeListEntry;

	let {
		files,
		editable = false,
		groupEditable = true,
		selectedTitleCounts,
		getGroupOptions,
		canMoveFile,
		selectedPaths,
		reorderEnabled = true,
		onFileClick,
		onFileKeydown,
		onPointerDown,
		onReorderFiles,
		onOpenNote,
		onMoveFileToGroup,
		onSetFileHidden,
		onRemoveFile,
	}: {
		files: NodeListEntry[];
		editable?: boolean;
		groupEditable?: boolean;
		selectedTitleCounts: Record<string, number>;
		getGroupOptions: (file: NodeListEntry) => DropdownOption[];
		canMoveFile: (file: NodeListEntry) => boolean;
		selectedPaths: Set<string>;
		reorderEnabled?: boolean;
		onFileClick: (path: string, event: MouseEvent) => void;
		onFileKeydown: (path: string, event: KeyboardEvent) => void;
		onPointerDown: (path: string, event: PointerEvent) => void;
		onReorderFiles: (paths: string[]) => void;
		onOpenNote: (path: string) => void;
		onMoveFileToGroup: (path: string, groupId: string) => void;
		onSetFileHidden: (path: string, hidden: boolean) => void;
		onRemoveFile: (path: string) => void;
	} = $props();

	let dndFiles = $state<CuratedDndEntry[]>([]);
	const filesByPath = $derived(
		new Map(files.map((file) => [file.id, file] as const)),
	);

	$effect(() => {
		const currentPaths = untrack(() => dndFiles.map((file) => file.id));
		if (
			files.length === currentPaths.length &&
			files.every((file, index) => file.id === currentPaths[index])
		) {
			return;
		}
		dndFiles = files.map((file) => ({ ...file }));
	});

	function handleDndConsider(event: CustomEvent<DndEvent<CuratedDndEntry>>) {
		dndFiles = readRealItems(event.detail.items);
	}

	function handleDndFinalize(event: CustomEvent<DndEvent<CuratedDndEntry>>) {
		if (!editable || !reorderEnabled) {
			return;
		}
		const orderedPaths = files.map((file) => file.path);
		const singleDraggedOrder = readRealItems(event.detail.items).map(
			(file) => file.path,
		);
		const nextOrder = buildCuratedMultiDragOrder({
			orderedPaths,
			draggedPath: event.detail.info.id,
			selectedPaths,
			singleDraggedOrder,
		});
		dndFiles = nextOrder
			.map((path) => dndFiles.find((file) => file.path === path))
			.filter((file): file is CuratedDndEntry => file !== undefined);
		onReorderFiles(nextOrder);
	}

	function readRealItems(items: CuratedDndEntry[]): CuratedDndEntry[] {
		return items.filter((item) => item.id !== SHADOW_PLACEHOLDER_ITEM_ID);
	}

	// Query lists never register drag/drop listeners or participate in zones.
	function sortable(node: HTMLElement, options: Options<CuratedDndEntry>) {
		if (!editable) return;
		return dragHandleZone(node, options);
	}
</script>

{#if dndFiles.length === 0}
	<div class="knowledge-workspace-curated-list">
		<span class="knowledge-workspace-curated-empty">No matching nodes</span>
	</div>
{:else}
	<div
		class="knowledge-workspace-curated-list"
		aria-label="Nodes"
		use:sortable={{
			items: dndFiles,
			flipDurationMs: 120,
			type: 'meta-graph-curated-files',
			dragDisabled: !reorderEnabled,
		}}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
	>
		{#each dndFiles as dndFile (dndFile.id)}
			{@const file = filesByPath.get(dndFile.id) ?? dndFile}
			{@const moveOptions = getGroupOptions(file)}
			<div
				class="knowledge-workspace-curated-file"
				class:query={!editable}
				class:dragging-set={editable &&
					selectedPaths.has(file.id) &&
					selectedPaths.size > 1}
				class:missing={file.missing}
				class:hidden={file.hidden}
				class:selected={selectedPaths.has(file.id)}
				data-curated-file-path={editable ? file.path : undefined}
				role="button"
				aria-pressed={selectedPaths.has(file.id)}
				tabindex="0"
				aria-label={file.missing
					? `${file.title} (file not found)`
					: file.title}
				title={file.unresolved
					? `Unresolved link: ${file.path}`
					: file.missing
						? `File not found: ${file.path}`
						: undefined}
				onclick={(event) => onFileClick(file.id, event)}
				onpointerdown={(event) => onPointerDown(file.id, event)}
				onkeydown={(event) => onFileKeydown(file.id, event)}
			>
				{#if editable}
					<span
						class="knowledge-workspace-drag-handle"
						aria-label={`Drag ${file.title}`}
						use:dragHandle
					></span>
				{/if}
				<span
					style={file.missing
						? undefined
						: `background: ${file.color ?? 'var(--color-green, #44a37f)'}`}
				></span>
				<div class="knowledge-workspace-curated-file-title">
					<strong title={file.detail}>{file.title}</strong>
					{#if (selectedTitleCounts[file.title] ?? 0) > 1}
						<span class="knowledge-workspace-curated-file-path"
							>{file.detail}</span
						>
					{/if}
					{#if groupEditable && canMoveFile(file)}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							class="knowledge-workspace-curated-file-group"
							class:missing={file.missingGroup}
							role="group"
							title={`Group: ${file.groupName}`}
							onclick={(event) => event.stopPropagation()}
							onkeydown={(event) => event.stopPropagation()}
							onpointerdown={(event) => event.stopPropagation()}
						>
							<span
								class="knowledge-workspace-curated-file-group-dot"
								style={file.groupColor
									? `background: ${file.groupColor}`
									: undefined}
								aria-hidden="true"
							></span>
							<ObsidianDropdown
								class="knowledge-workspace-curated-group-select"
								value={file.groupId}
								options={moveOptions.length
									? moveOptions
									: [
											{
												value: file.groupId,
												label:
													file.groupName ||
													'No group',
											},
										]}
								disabled={moveOptions.length === 0}
								ariaLabel={`Group for ${file.title}`}
								onChange={(value) =>
									onMoveFileToGroup(file.id, value)}
							/>
						</div>
					{:else}
						<span
							class="knowledge-workspace-node-list-group"
							title={file.groupName}
						>
							<span
								style:background={file.groupColor ??
									'var(--text-faint)'}
								aria-hidden="true"
							></span>
							{file.groupName}
						</span>
					{/if}
				</div>
				{#if editable}
					<ObsidianButton
						ariaLabel={file.hidden
							? `Show ${file.title}`
							: `Hide ${file.title}`}
						icon={file.hidden ? 'eye-off' : 'eye'}
						tooltip={file.hidden
							? 'Show in graph'
							: 'Hide from graph'}
						onClick={(event) => {
							event.stopPropagation();
							onSetFileHidden(file.path, !file.hidden);
						}}
					/>
				{/if}
				<ObsidianButton
					ariaLabel={`Open ${file.title}`}
					icon="file-text"
					disabled={file.missing || file.unresolved}
					onClick={(event) => {
						event.stopPropagation();
						onOpenNote(file.path);
					}}
				/>
				{#if editable}
					<ObsidianButton
						ariaLabel={`Remove ${file.title}`}
						icon="x"
						onClick={(event) => {
							event.stopPropagation();
							onRemoveFile(file.path);
						}}
					/>
				{/if}
			</div>
		{/each}
	</div>
{/if}
