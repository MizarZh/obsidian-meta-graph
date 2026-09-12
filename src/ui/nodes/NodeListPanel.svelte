<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		ChartGroupDefinition,
		ChartSource,
		CuratedWorkspaceConfig,
		KnowledgeNode,
	} from '@/core/types';
	import {
		getGroupMoveTargets,
		canMoveNodeToGroup,
	} from '@/query/group-ownership';
	import NodeList from '@/ui/nodes/NodeList.svelte';
	import {
		filterNodeListEntries as filterSelectedFiles,
		retainNodeListSelection,
		type NodeListEntry,
	} from '@/ui/nodes/node-list-state';
	import {
		countTitles,
		createCuratedConditionDraft,
		type CuratedConditionDraft,
	} from '@/ui/curated/curated-panel-state';
	import AddNotesModal from '@/ui/notes/AddNotesModal.svelte';
	import NoteFilterModal from '@/ui/notes/NoteFilterModal.svelte';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from '@/ui/obsidian/ObsidianTextInput.svelte';

	let {
		embedded = false,
		app,
		source,
		files: selectedFiles,
		curated,
		nodes,
		groups,
		groupRequired = false,
		groupEditable = true,
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
		embedded?: boolean;
		app: App;
		source: ChartSource;
		files: NodeListEntry[];
		curated: CuratedWorkspaceConfig;
		nodes: KnowledgeNode[];
		groups: ChartGroupDefinition[];
		groupRequired?: boolean;
		groupEditable?: boolean;
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
	const editable = $derived(source === 'curated');

	const addGroupOptions = $derived([
		...(groupRequired ? [] : [{ value: '', label: 'No group' }]),
		...groups.map((group) => ({ value: group.id, label: group.name })),
	]);
	const selectedMoveOptions = $derived.by(() => {
		const files = selectedFiles.filter((file) => selected.has(file.id));
		const first = files[0];
		if (!first) return [];
		return getGroupOptions(first).filter((option) =>
			files.every((file) =>
				getGroupOptions(file).some(
					(candidate) => candidate.value === option.value,
				),
			),
		);
	});
	const groupsById = $derived(
		new Map(groups.map((group) => [group.id, group])),
	);
	const selectedPaths = $derived(
		new Set(curated.files.map((file) => file.path)),
	);
	const nodesById = $derived(new Map(nodes.map((node) => [node.id, node])));
	const filteredSelectedFiles = $derived(
		filterSelectedFiles(
			selectedFiles,
			listSearch,
			nodesById,
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
		selectedFiles.filter((file) => selected.has(file.id)).length,
	);
	const memberIds = $derived(new Set(selectedFiles.map((file) => file.id)));
	$effect(() => {
		const retained = retainNodeListSelection(selected, memberIds);
		if (retained !== selected) onSelectedPathsChange(retained);
		if (lastSelectedPath && !memberIds.has(lastSelectedPath))
			lastSelectedPath = undefined;
	});

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

	function selectFileRange(path: string, additive: boolean): void {
		const paths = filteredSelectedFiles.map((file) => file.id);
		const currentIndex = paths.indexOf(path);
		const anchorIndex = lastSelectedPath
			? paths.indexOf(lastSelectedPath)
			: -1;
		if (currentIndex < 0 || anchorIndex < 0) {
			onSelectedPathsChange(
				new Set(additive ? [...selected, path] : [path]),
			);
			lastSelectedPath = path;
			return;
		}
		const [start, end] =
			currentIndex < anchorIndex
				? [currentIndex, anchorIndex]
				: [anchorIndex, currentIndex];
		const next = new Set(additive ? selected : []);
		for (const selectedPath of paths.slice(start, end + 1)) {
			next.add(selectedPath);
		}
		onSelectedPathsChange(next);
	}

	function selectFile(path: string, event: MouseEvent | KeyboardEvent): void {
		const additive = event.ctrlKey || event.metaKey;
		if (event.shiftKey) selectFileRange(path, additive);
		else if (additive) toggleSelected(path);
		else {
			onSelectedPathsChange(new Set([path]));
			lastSelectedPath = path;
		}
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
		if (event.shiftKey || event.ctrlKey || event.metaKey)
			event.preventDefault();
		selectFile(path, event);
	}

	function handleFileKeydown(path: string, event: KeyboardEvent): void {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			const file = selectedFiles.find((entry) => entry.id === path);
			if (file && !file.missing && !file.unresolved)
				onOpenNote(file.path);
			return;
		}
		if (event.key !== ' ') return;
		event.preventDefault();
		selectFile(path, event);
	}

	function clearSelection(): void {
		onSelectedPathsChange(new Set());
		lastSelectedPath = undefined;
	}

	function selectAllMatching(): void {
		onSelectedPathsChange(
			new Set(filteredSelectedFiles.map((file) => file.id)),
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
		if (!selectedMoveOptions.some((option) => option.value === groupId))
			return;
		const paths = selectedFiles
			.map((file) => file.id)
			.filter((path) => selected.has(path));
		if (paths.length === 0) {
			return;
		}
		onMoveFilesToGroup(paths, groupId || undefined);
	}

	function moveFileToGroup(path: string, groupId: string): void {
		const file = selectedFiles.find((file) => file.id === path);
		if (
			!file ||
			!getGroupOptions(file).some((option) => option.value === groupId)
		)
			return;
		onMoveFilesToGroup([path], groupId || undefined);
	}

	function getGroupOptions(file: NodeListEntry) {
		const node = nodesById.get(file.id);
		const targets = getGroupMoveTargets(node, groups);
		if (targets.length === 0) return [];
		return [
			...(!groupRequired && canMoveNodeToGroup(node, groups, null)
				? [{ value: '', label: 'No group' }]
				: []),
			...targets.map((group) => ({ value: group.id, label: group.name })),
		];
	}

	function canMoveFile(file: NodeListEntry): boolean {
		return (
			groupsById.get(file.groupId)?.mode !== 'rule' ||
			getGroupOptions(file).length > 1
		);
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
	class:knowledge-workspace-panel-embedded={embedded}
	class:knowledge-workspace-curated-panel-collapsed={!panelOpen}
	class:target={dropTarget}
	data-curated-drop-target={editable && panelOpen ? '' : undefined}
	style={embedded ? undefined : `width: ${panelWidth}px`}
>
	{#if !embedded}
		<div
			class="knowledge-workspace-curated-resize-handle"
			role="separator"
			aria-label="Resize node list"
			onpointerdown={handleResizePointerDown}
		></div>
		<ObsidianButton
			class="knowledge-workspace-curated-toggle"
			icon={panelOpen ? 'panel-left-close' : 'panel-left-open'}
			ariaLabel={panelOpen ? 'Close node list' : 'Open node list'}
			tooltip={panelOpen ? 'Close node list' : 'Open node list'}
			onClick={onTogglePanel}
		/>
	{/if}
	<section aria-hidden={!panelOpen}>
		<header
			class="knowledge-workspace-curated-header"
			class:query={!editable}
		>
			<h3>Node list <small>{editable ? 'Workspace' : 'Query'}</small></h3>
			<span
				>{filteredSelectedFiles.length === selectedFiles.length
					? selectedFiles.length
					: `${filteredSelectedFiles.length}/${selectedFiles.length}`}</span
			>
			<ObsidianButton
				class="knowledge-workspace-curated-search"
				icon="search"
				active={searchOpen}
				ariaLabel="Search nodes"
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
				ariaLabel="Filter node list"
				tooltip="Filter node list (does not change graph)"
				onClick={() => (filterModalOpen = true)}
			/>
			{#if editable}
				<ObsidianButton
					class="knowledge-workspace-curated-add"
					icon="plus"
					ariaLabel="Add notes"
					tooltip="Add notes"
					onClick={() => (addNotesOpen = true)}
				/>
			{/if}
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
			{#if editable}
				<ObsidianButton
					class="knowledge-workspace-curated-clear"
					icon="trash-2"
					ariaLabel="Clear workspace"
					tooltip="Clear workspace"
					disabled={curated.files.length === 0}
					destructive={true}
					onClick={clearAll}
				/>
			{/if}
		</header>
		{#if searchOpen}
			<div class="knowledge-workspace-curated-list-search">
				<ObsidianTextInput
					type="search"
					placeholder="Search nodes..."
					ariaLabel="Search nodes"
					value={listSearch}
					onInput={(value) => (listSearch = value)}
				/>
				{#if listSearchActive}
					<ObsidianButton
						icon="x"
						class="knowledge-workspace-curated-list-search-clear"
						ariaLabel="Clear node search"
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
				{#if groupEditable}
					<label
						class="knowledge-workspace-curated-selection-group"
						title={selectedMoveOptions.length === 0
							? 'No shared destination; rule-based nodes can only move between matching rules'
							: undefined}
					>
						<span>Group</span>
						<ObsidianDropdown
							value="__move__"
							options={[
								{ value: '__move__', label: 'Move to group' },
								...selectedMoveOptions,
							]}
							ariaLabel="Move selected to group"
							disabled={selectedMoveOptions.length === 0}
							onChange={(value) => {
								if (value !== '__move__') {
									moveSelectedToGroup(value);
								}
							}}
						/>
					</label>
				{/if}
				{#if editable}
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
				{/if}
				<ObsidianButton
					icon="circle-off"
					ariaLabel="Clear selection"
					tooltip="Clear selection"
					onClick={clearSelection}
				/>
			{:else if filterCount > 0 || listSearchActive || !editable}
				<ObsidianButton
					text="Select all matching"
					icon="list-checks"
					disabled={filteredSelectedFiles.length === 0}
					onClick={selectAllMatching}
				/>
			{/if}
		</div>
		<NodeList
			{editable}
			{groupEditable}
			files={filteredSelectedFiles}
			selectedTitleCounts={filteredSelectedTitleCounts}
			{getGroupOptions}
			{canMoveFile}
			selectedPaths={selected}
			reorderEnabled={editable && !listSearchActive && filterCount === 0}
			onFileClick={handleFileClick}
			onFileKeydown={handleFileKeydown}
			onPointerDown={handleFilePointerDown}
			{onReorderFiles}
			{onOpenNote}
			onMoveFileToGroup={moveFileToGroup}
			onSetFileHidden={(path, hidden) => onSetFilesHidden([path], hidden)}
			{onRemoveFile}
		/>
	</section>
	{#if editable}
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
	{/if}
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
