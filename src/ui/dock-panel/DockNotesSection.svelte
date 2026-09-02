<script lang="ts">
	import {
		SHADOW_PLACEHOLDER_ITEM_ID,
		dragHandle,
		dragHandleZone,
		type DndEvent,
	} from 'svelte-dnd-action';
	import type { DockDragPayload } from '../dock/types';
	import ObsidianButton from '../obsidian/ObsidianButton.svelte';
	import ObsidianTextInput from '../obsidian/ObsidianTextInput.svelte';
	import {
		dragKey,
		noteDragPayload,
		type DockNoteEntry,
	} from './dock-panel-state';

	type DockNoteDndEntry = Omit<DockNoteEntry, 'id'> & {
		id: string;
		nodeId: string;
	};

	let {
		notes,
		notesTitleCounts,
		activeConnectionField,
		activeDraggingKey,
		graphTargetNotePath,
		focusOnSelect,
		onToggleFocusOnSelect,
		onOpenPicker,
		onRemoveNote,
		onPointerDown,
		onLinkPointerDown,
		onReorderNotes,
		onOpenNote,
	}: {
		notes: DockNoteEntry[];
		notesTitleCounts: Record<string, number>;
		activeConnectionField: string;
		activeDraggingKey?: string;
		graphTargetNotePath?: string;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
		onOpenPicker: () => void;
		onRemoveNote: (path: string) => void;
		onPointerDown: (payload: DockDragPayload, event: PointerEvent) => void;
		onLinkPointerDown: (
			payload: DockDragPayload,
			event: PointerEvent,
		) => void;
		onReorderNotes: (paths: string[]) => void;
		onOpenNote: (nodeId: string) => void;
	} = $props();

	let search = $state('');
	let searchOpen = $state(false);
	let selectedPaths = $state<Set<string>>(new Set());
	let lastSelectedPath = $state<string | undefined>(undefined);
	let dndNotes = $state<DockNoteDndEntry[]>([]);

	const searchActive = $derived(search.trim().length > 0);
	const visibleNotes = $derived.by(() => {
		const query = search.trim().toLocaleLowerCase();
		return notes.filter(
			(note) =>
				!query ||
				`${note.title} ${note.path}`
					.toLocaleLowerCase()
					.includes(query),
		);
	});

	$effect(() => {
		dndNotes = visibleNotes.map((entry) => ({
			...entry,
			id: entry.path,
			nodeId: entry.id,
		}));
	});

	$effect(() => {
		const availablePaths = new Set(notes.map((note) => note.path));
		const nextSelectedPaths = new Set(
			[...selectedPaths].filter((path) => availablePaths.has(path)),
		);
		if (nextSelectedPaths.size !== selectedPaths.size) {
			selectedPaths = nextSelectedPaths;
		}
		if (lastSelectedPath && !availablePaths.has(lastSelectedPath)) {
			lastSelectedPath = undefined;
		}
	});

	function handleDndConsider(event: CustomEvent<DndEvent<DockNoteDndEntry>>) {
		dndNotes = readRealItems(event.detail.items);
	}

	function handleDndFinalize(event: CustomEvent<DndEvent<DockNoteDndEntry>>) {
		if (searchActive) return;
		dndNotes = readRealItems(event.detail.items);
		onReorderNotes(dndNotes.map((entry) => entry.path));
	}

	function readRealItems(items: DockNoteDndEntry[]): DockNoteDndEntry[] {
		return items.filter((item) => item.id !== SHADOW_PLACEHOLDER_ITEM_ID);
	}

	function toggleSelected(path: string): void {
		const next = new Set(selectedPaths);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selectedPaths = next;
		lastSelectedPath = path;
	}

	function selectNoteRange(path: string): void {
		const paths = notes.map((note) => note.path);
		const currentIndex = paths.indexOf(path);
		const anchorIndex = lastSelectedPath
			? paths.indexOf(lastSelectedPath)
			: -1;
		if (currentIndex < 0 || anchorIndex < 0) {
			toggleSelected(path);
			return;
		}
		const [start, end] =
			currentIndex < anchorIndex
				? [currentIndex, anchorIndex]
				: [anchorIndex, currentIndex];
		const next = new Set(selectedPaths);
		for (const selectedPath of paths.slice(start, end + 1)) {
			next.add(selectedPath);
		}
		selectedPaths = next;
	}

	function handleNoteClick(path: string, event: MouseEvent): void {
		if (
			event.target instanceof Element &&
			event.target.closest(
				'button, input, .knowledge-workspace-drag-handle',
			)
		) {
			return;
		}
		if (event.shiftKey) {
			event.preventDefault();
			selectNoteRange(path);
			return;
		}
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			toggleSelected(path);
		}
	}

	function handleNoteCheckboxClick(path: string, event: MouseEvent): void {
		event.stopPropagation();
		if (event.shiftKey) selectNoteRange(path);
		else toggleSelected(path);
	}

	function handleNoteKeydown(path: string, event: KeyboardEvent): void {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			const note = notes.find((entry) => entry.path === path);
			if (!note?.broken) onOpenNote(path);
			return;
		}
		if (event.key !== ' ') return;
		event.preventDefault();
		if (event.shiftKey) selectNoteRange(path);
		else toggleSelected(path);
	}

	function removeSelected(): void {
		for (const path of selectedPaths) onRemoveNote(path);
		selectedPaths = new Set();
		lastSelectedPath = undefined;
	}
</script>

<section class="knowledge-workspace-dock-tab-content">
	<div class="knowledge-workspace-dock-collection-header">
		<span>{notes.length} pinned notes</span>
		<div class="knowledge-workspace-dock-collection-actions">
			<ObsidianButton
				class="knowledge-workspace-dock-search-toggle"
				icon="search"
				active={searchOpen}
				ariaLabel="Search pinned notes"
				tooltip="Search"
				onClick={() => {
					searchOpen = !searchOpen;
					if (!searchOpen) search = '';
				}}
			/>
			<ObsidianButton
				class="knowledge-workspace-dock-focus-toggle"
				icon="crosshair"
				active={focusOnSelect}
				ariaLabel={focusOnSelect
					? 'Auto-focus on click (enabled)'
					: 'Auto-focus on click (disabled)'}
				tooltip="Auto-focus on click"
				onClick={onToggleFocusOnSelect}
			/>
			<ObsidianButton
				icon="plus"
				text="Add notes"
				ariaLabel="Add pinned notes"
				onClick={onOpenPicker}
			/>
		</div>
	</div>
	{#if searchOpen}
		<div class="knowledge-workspace-dock-collection-search">
			<ObsidianTextInput
				type="search"
				placeholder="Search pinned notes..."
				ariaLabel="Search pinned notes"
				value={search}
				onInput={(value) => (search = value)}
			/>
			{#if searchActive}
				<ObsidianButton
					icon="x"
					class="knowledge-workspace-dock-search-clear"
					ariaLabel="Clear pinned note search"
					tooltip="Clear search"
					onClick={() => (search = '')}
				/>
			{/if}
		</div>
	{/if}
	{#if selectedPaths.size > 0}
		<div class="knowledge-workspace-dock-selection-tools">
			<span>{selectedPaths.size} selected</span>
			<ObsidianButton
				icon="trash-2"
				text="Remove"
				destructive={true}
				onClick={removeSelected}
			/>
			<ObsidianButton
				icon="circle-off"
				ariaLabel="Clear selection"
				tooltip="Clear selection"
				onClick={() => {
					selectedPaths = new Set();
					lastSelectedPath = undefined;
				}}
			/>
		</div>
	{/if}
	{#if dndNotes.length === 0}
		<div class="knowledge-workspace-dock-list">
			<span class="knowledge-workspace-dock-empty">No pinned notes</span>
		</div>
	{:else}
		<div
			class="knowledge-workspace-dock-list"
			aria-label="Pinned notes"
			use:dragHandleZone={{
				items: dndNotes,
				flipDurationMs: 120,
				type: 'meta-graph-dock-notes',
				dragDisabled: searchActive,
			}}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
		>
			{#each dndNotes as entry (entry.id)}
				{@const payload = noteDragPayload(entry, activeConnectionField)}
				<div
					class:dragging={activeDraggingKey === dragKey(payload)}
					class:target={!entry.broken &&
						graphTargetNotePath === entry.path}
					class:selected={selectedPaths.has(entry.path)}
					class="knowledge-workspace-dock-node note"
					class:broken={entry.broken}
					data-dock-note-path={entry.path}
					role="button"
					tabindex="0"
					aria-label={entry.broken
						? `${entry.title} (file not found)`
						: entry.title}
					title={entry.broken
						? `File not found: ${entry.path}`
						: undefined}
					onclick={(event) => handleNoteClick(entry.path, event)}
					onkeydown={(event) => handleNoteKeydown(entry.path, event)}
					onpointerdown={(event) => onPointerDown(payload, event)}
				>
					<span
						class="knowledge-workspace-drag-handle"
						aria-label={`Reorder ${entry.title}`}
						use:dragHandle
					></span>
					<input
						type="checkbox"
						aria-label={`Select ${entry.title}`}
						checked={selectedPaths.has(entry.path)}
						onclick={(event) =>
							handleNoteCheckboxClick(entry.path, event)}
					/>
					<span
						style={entry.broken
							? undefined
							: `background: ${entry.color ?? 'var(--color-green, #44a37f)'}`}
					></span>
					<div class="knowledge-workspace-dock-node-title">
						<strong>{entry.title}</strong>
						{#if (notesTitleCounts[entry.title] ?? 0) > 1}
							<span class="knowledge-workspace-dock-node-path"
								>{entry.path}</span
							>
						{/if}
					</div>
					<ObsidianButton
						icon="link"
						ariaLabel={`Connect ${entry.title}`}
						tooltip="Connect"
						disabled={entry.broken}
						onPointerDown={(event) =>
							onLinkPointerDown(payload, event)}
					/>
					<ObsidianButton
						icon="file-text"
						ariaLabel={`Open ${entry.title}`}
						tooltip="Open"
						disabled={entry.broken}
						onClick={() => onOpenNote(entry.path)}
					/>
				</div>
			{/each}
		</div>
	{/if}
</section>
