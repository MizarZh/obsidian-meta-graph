<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		ChartGroup,
		CuratedWorkspaceConfig,
		KnowledgeNode,
		ManualLayoutConfig,
	} from '../core/types';
	import { nodeMatchesFilterGroup } from '../query/filters';
	import CuratedFileList from './curated/CuratedFileList.svelte';
	import {
		buildSelectedCuratedFiles,
		countTitles,
		createCuratedConditionDraft,
		type CuratedConditionDraft,
	} from './curated/curated-panel-state';
	import AddNotesModal from './notes/AddNotesModal.svelte';
	import NoteFilterModal from './notes/NoteFilterModal.svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';

	let {
		app,
		curated,
		nodes,
		groups,
		manualLayout,
		groupRequired = false,
		folders,
		nodeColors,
		workspaceFilePath,
		panelOpen,
		onTogglePanel,
		panelWidth,
		onResizePanel,
		focusOnSelect,
		onToggleFocusOnSelect,
		dropTarget,
		selectedPaths: selected,
		onSelectedPathsChange,
		conditionDraft,
		onConditionDraftChange,
		onAddFiles,
		onRemoveFile,
		onRemoveFiles,
		onSetFilesHidden,
		onMoveFilesToGroup,
		onClearFiles,
		onReorderFiles,
		onOpenNote,
		onSelectNote,
	}: {
		app: App;
		curated: CuratedWorkspaceConfig;
		nodes: KnowledgeNode[];
		groups: ChartGroup[];
		manualLayout: ManualLayoutConfig;
		groupRequired?: boolean;
		folders: string[];
		nodeColors: Map<string, string>;
		workspaceFilePath?: string;
		panelOpen: boolean;
		onTogglePanel: () => void;
		panelWidth: number;
		onResizePanel: (width: number) => void;
		focusOnSelect: boolean;
		onToggleFocusOnSelect: () => void;
		dropTarget: boolean;
		selectedPaths: Set<string>;
		onSelectedPathsChange: (paths: Set<string>) => void;
		conditionDraft: CuratedConditionDraft;
		onConditionDraftChange: (draft: CuratedConditionDraft) => void;
		onAddFiles: (paths: string[], groupId?: string) => void;
		onRemoveFile: (path: string) => void;
		onRemoveFiles: (paths: string[]) => void;
		onSetFilesHidden: (paths: string[], hidden: boolean) => void;
		onMoveFilesToGroup: (paths: string[], groupId?: string) => void;
		onClearFiles: () => void;
		onReorderFiles: (paths: string[]) => void;
		onOpenNote: (path: string) => void;
		onSelectNote: (path: string) => void;
	} = $props();

	let listSearch = $state('');
	let addGroupId = $state('');
	let searchOpen = $state(false);
	let addNotesOpen = $state(false);
	let filterModalOpen = $state(false);
	let addNotesDraft = $state(createCuratedConditionDraft());
	let lastSelectedPath = $state<string | undefined>(undefined);

	const addGroupOptions = $derived([
		...(groupRequired ? [] : [{ value: '', label: 'No group' }]),
		...groups.map((group) => ({ value: group.id, label: group.name })),
	]);
	const groupOptions = $derived(addGroupOptions);
	const groupsById = $derived(
		new Map(groups.map((group) => [group.id, group])),
	);
	const selectedPaths = $derived(
		new Set(curated.files.map((file) => file.path)),
	);
	const nodesByPath = $derived(
		new Map(nodes.map((node) => [node.path, node])),
	);
	const selectedFiles = $derived(
		buildSelectedCuratedFiles(
			curated,
			nodesByPath,
			manualLayout,
			groupsById,
			nodeColors,
			selected,
		),
	);
	const selectedTitleCounts = $derived(countTitles(selectedFiles));
	const filteredSelectedFiles = $derived(
		filterSelectedFiles(
			selectedFiles,
			listSearch,
			nodesByPath,
			conditionDraft.filterRoot,
		),
	);
	const filteredSelectedTitleCounts = $derived(
		countTitles(filteredSelectedFiles),
	);
	const listSearchActive = $derived(listSearch.trim().length > 0);
	const filterCount = $derived(
		countFilterConditions(conditionDraft.filterRoot),
	);
	const selectedCount = $derived(
		curated.files.filter((file) => selected.has(file.path)).length,
	);

	$effect(() => {
		if (addGroupId && !groups.some((group) => group.id === addGroupId)) {
			addGroupId = '';
		}
		if (groupRequired && !addGroupId && groups[0]) {
			addGroupId = groups[0].id;
		}
	});

	function toggleSelected(path: string): void {
		const next = new Set(selected);
		if (next.has(path)) {
			next.delete(path);
		} else {
			next.add(path);
		}
		onSelectedPathsChange(next);
		lastSelectedPath = path;
	}

	function selectFileRange(path: string): void {
		const paths = curated.files.map((file) => file.path);
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
		const next = new Set(selected);
		for (const selectedPath of paths.slice(start, end + 1)) {
			next.add(selectedPath);
		}
		onSelectedPathsChange(next);
	}

	function handleFileClick(path: string, event: MouseEvent): void {
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
			selectFileRange(path);
			return;
		}
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			toggleSelected(path);
		}
	}

	function handleFileCheckboxClick(path: string, event: MouseEvent): void {
		event.stopPropagation();
		if (event.shiftKey) selectFileRange(path);
		else toggleSelected(path);
	}

	function clearSelection(): void {
		onSelectedPathsChange(new Set());
		lastSelectedPath = undefined;
	}

	function selectAllMatching(): void {
		onSelectedPathsChange(
			new Set(filteredSelectedFiles.map((file) => file.path)),
		);
	}

	function removeSelected(): void {
		const paths = curated.files
			.map((file) => file.path)
			.filter((path) => selected.has(path));
		if (paths.length === 0) {
			return;
		}
		onRemoveFiles(paths);
		clearSelection();
	}

	function setSelectedHidden(hidden: boolean): void {
		const paths = curated.files
			.map((file) => file.path)
			.filter((path) => selected.has(path));
		if (paths.length === 0) {
			return;
		}
		onSetFilesHidden(paths, hidden);
	}

	function moveSelectedToGroup(groupId: string): void {
		const paths = curated.files
			.map((file) => file.path)
			.filter((path) => selected.has(path));
		if (paths.length === 0) {
			return;
		}
		onMoveFilesToGroup(paths, groupId || undefined);
	}

	function moveFileToGroup(path: string, groupId: string): void {
		onMoveFilesToGroup([path], groupId || undefined);
	}

	function getGroupOptions(currentGroupId: string) {
		return currentGroupId && !groupsById.has(currentGroupId)
			? [
					...groupOptions,
					{ value: currentGroupId, label: 'Missing group' },
				]
			: groupOptions;
	}

	function clearAll(): void {
		if (
			curated.files.length === 0 ||
			!window.confirm('Remove all workspace files from this view?')
		) {
			return;
		}
		onClearFiles();
		clearSelection();
	}

	function handleFilePointerDown(path: string, event: PointerEvent): void {
		if (
			event.target instanceof Element &&
			event.target.closest(
				'button, input, .knowledge-workspace-drag-handle',
			)
		) {
			return;
		}
		onSelectNote(path);
	}

	function handleResizePointerDown(event: PointerEvent): void {
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = panelWidth;
		function onMove(moveEvent: PointerEvent) {
			const newWidth = Math.max(
				240,
				Math.min(420, startWidth + moveEvent.clientX - startX),
			);
			onResizePanel(newWidth);
		}
		function onUp() {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	}

	function filterSelectedFiles(
		files: typeof selectedFiles,
		search: string,
		indexedNodes: Map<string, KnowledgeNode>,
		filterRoot: CuratedConditionDraft['filterRoot'],
	): typeof selectedFiles {
		const query = search.trim().toLocaleLowerCase();
		return files
			.filter((file) => {
				const node = indexedNodes.get(file.path);
				return node
					? nodeMatchesFilterGroup(node, filterRoot)
					: filterRoot.children.length === 0;
			})
			.filter(
				(file) =>
					!query ||
					[
						file.title,
						file.path,
						file.detail,
						file.groupId,
						file.groupName,
						...(indexedNodes.get(file.path)?.aliases ?? []),
					].some((value) =>
						value?.toLocaleLowerCase().includes(query),
					),
			);
	}

	function countFilterConditions(
		group: CuratedConditionDraft['filterRoot'],
	): number {
		return group.children.reduce(
			(total, child) =>
				total +
				(child.kind === 'group' ? countFilterConditions(child) : 1),
			0,
		);
	}
</script>

<aside
	class="knowledge-workspace-curated-panel"
	class:knowledge-workspace-curated-panel-collapsed={!panelOpen}
	class:target={dropTarget}
	data-curated-drop-target={panelOpen ? '' : undefined}
	style="width: {panelOpen ? `${panelWidth}px` : undefined}"
>
	<div
		class="knowledge-workspace-curated-resize-handle"
		role="separator"
		aria-label="Resize workspace files"
		onpointerdown={handleResizePointerDown}
	></div>
	<ObsidianButton
		class="knowledge-workspace-curated-toggle"
		icon={panelOpen ? 'panel-left-close' : 'panel-left-open'}
		ariaLabel={panelOpen ? 'Close workspace files' : 'Open workspace files'}
		onClick={onTogglePanel}
	/>
	{#if panelOpen}
		<section>
			<header class="knowledge-workspace-curated-header">
				<h3>Workspace files</h3>
				<span>{selectedFiles.length}</span>
				<ObsidianButton
					class="knowledge-workspace-curated-search"
					icon="search"
					active={searchOpen}
					ariaLabel="Search workspace files"
					tooltip="Search"
					onClick={() => {
						searchOpen = !searchOpen;
						if (!searchOpen) listSearch = '';
					}}
				/>
				<ObsidianButton
					class="knowledge-workspace-curated-filter"
					icon="list-filter"
					active={filterCount > 0}
					ariaLabel="Filter workspace files"
					tooltip="Filter"
					onClick={() => (filterModalOpen = true)}
				/>
				<ObsidianButton
					class="knowledge-workspace-curated-add"
					icon="plus"
					ariaLabel="Add notes"
					tooltip="Add notes"
					onClick={() => (addNotesOpen = true)}
				/>
				<ObsidianButton
					class="knowledge-workspace-curated-focus-toggle"
					icon="crosshair"
					active={focusOnSelect}
					ariaLabel={focusOnSelect
						? 'Auto-focus on click (enabled)'
						: 'Auto-focus on click (disabled)'}
					tooltip="Auto-focus on click"
					onClick={onToggleFocusOnSelect}
				/>
				<ObsidianButton
					class="knowledge-workspace-curated-clear"
					icon="trash-2"
					ariaLabel="Clear workspace"
					tooltip="Clear workspace"
					disabled={curated.files.length === 0}
					destructive={true}
					onClick={clearAll}
				/>
			</header>
			{#if searchOpen}
				<div class="knowledge-workspace-curated-list-search">
					<ObsidianTextInput
						type="search"
						placeholder="Search workspace files..."
						ariaLabel="Search workspace files"
						value={listSearch}
						onInput={(value) => (listSearch = value)}
					/>
					{#if listSearchActive}
						<ObsidianButton
							icon="x"
							class="knowledge-workspace-curated-list-search-clear"
							ariaLabel="Clear workspace file search"
							tooltip="Clear search"
							onClick={() => (listSearch = '')}
						/>
					{/if}
				</div>
			{/if}
			{#if filterCount > 0}
				<div class="knowledge-workspace-curated-filter-status">
					<button
						type="button"
						class="knowledge-workspace-curated-filter-chip"
						onclick={() => (filterModalOpen = true)}
					>
						{filterCount} conditions
					</button>
				</div>
			{/if}
			<div class="knowledge-workspace-curated-actions">
				{#if selectedCount > 0}
					<span class="knowledge-workspace-curated-selection-count">
						{selectedCount} selected
					</span>
					<label class="knowledge-workspace-curated-selection-group">
						<span>Group</span>
						<ObsidianDropdown
							value="__move__"
							options={[
								{ value: '__move__', label: 'Move to group' },
								...groupOptions,
							]}
							ariaLabel="Move selected to group"
							onChange={(value) => {
								if (value !== '__move__') {
									moveSelectedToGroup(value);
								}
							}}
						/>
					</label>
					<ObsidianButton
						icon="eye-off"
						ariaLabel="Hide selected"
						tooltip="Hide selected from graph"
						onClick={() => setSelectedHidden(true)}
					/>
					<ObsidianButton
						icon="eye"
						ariaLabel="Show selected"
						tooltip="Show selected in graph"
						onClick={() => setSelectedHidden(false)}
					/>
					<ObsidianButton
						icon="trash-2"
						ariaLabel="Remove selected"
						tooltip="Remove selected"
						destructive={true}
						onClick={removeSelected}
					/>
					<ObsidianButton
						icon="circle-off"
						ariaLabel="Clear selection"
						tooltip="Clear selection"
						onClick={clearSelection}
					/>
				{:else if filterCount > 0 || listSearchActive}
					<ObsidianButton
						text="Select all matching"
						icon="list-checks"
						disabled={filteredSelectedFiles.length === 0}
						onClick={selectAllMatching}
					/>
				{/if}
			</div>
			<CuratedFileList
				files={filteredSelectedFiles}
				selectedTitleCounts={filteredSelectedTitleCounts}
				{getGroupOptions}
				selectedPaths={selected}
				reorderEnabled={!listSearchActive && filterCount === 0}
				onCheckboxClick={handleFileCheckboxClick}
				onFileClick={handleFileClick}
				onPointerDown={handleFilePointerDown}
				{onReorderFiles}
				{onOpenNote}
				{onSelectNote}
				onMoveFileToGroup={moveFileToGroup}
				onSetFileHidden={(path, hidden) =>
					onSetFilesHidden([path], hidden)}
				{onRemoveFile}
			/>
		</section>
	{/if}
	<AddNotesModal
		{app}
		open={addNotesOpen}
		{nodes}
		existingPaths={selectedPaths}
		{workspaceFilePath}
		{nodeColors}
		{folders}
		draft={addNotesDraft}
		groupId={addGroupId}
		groupOptions={addGroupOptions}
		showGroup={true}
		onDraftChange={(draft) => (addNotesDraft = draft)}
		onGroupChange={(value) => (addGroupId = value)}
		{onAddFiles}
		onClose={() => (addNotesOpen = false)}
	/>
	<NoteFilterModal
		{app}
		open={filterModalOpen}
		{nodes}
		{folders}
		draft={conditionDraft}
		onDraftChange={onConditionDraftChange}
		onClose={() => (filterModalOpen = false)}
	/>
</aside>
