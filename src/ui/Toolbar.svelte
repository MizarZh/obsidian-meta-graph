<script lang="ts">
	import { setIcon, setTooltip, type App, type IconName } from 'obsidian';
	import {
		CHART_TYPE_DEFINITIONS,
		CHART_TYPE_ORDER,
		getChartTypeName,
	} from '../core/chart-types';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianSlider from './obsidian/ObsidianSlider.svelte';
	import ObsidianSuggestInput from './obsidian/ObsidianSuggestInput.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';
	import type {
		ChartSource,
		CreateChartInput,
		KnowledgeNode,
		MetaGraphChart,
		SettingsPanelMode,
		ViewMode,
	} from '../core/types';

	let {
		app,
		mode,
		chartSource,
		charts,
		activeChartId,
		searchNodes,
		readOnly = false,
		onSelectChart,
		onCreateChart,
		onRenameChart,
		onChartType,
		onChartSource,
		onDeleteChart,
		onFocusNode,
		onFindNoteInputEl,
		onZoomIn,
		onZoomOut,
		zoomLevel,
		onZoomLevel,
		connectionUndoCount,
		connectionRedoCount,
		onUndoConnection,
		onRedoConnection,
		onFit,
		onRefresh,
		settingsPanel,
		onSettingsPanel,
		showDebugButton,
		debugOpen,
		onToggleDebug,
		shortcutsOpen,
		onShowShortcuts,
	}: {
		app: App;
		mode: ViewMode;
		chartSource: ChartSource;
		charts: MetaGraphChart[];
		activeChartId: string;
		searchNodes: KnowledgeNode[];
		readOnly?: boolean;
		onSelectChart: (id: string) => void | Promise<void>;
		onCreateChart: (input: CreateChartInput) => void;
		onRenameChart: (name: string) => void;
		onChartType: (mode: ViewMode) => void;
		onChartSource: (source: ChartSource) => void;
		onDeleteChart: () => void;
		onFocusNode: (id: string) => void;
		onFindNoteInputEl: (element: HTMLInputElement) => void;
		onZoomIn: () => void;
		onZoomOut: () => void;
		zoomLevel: number;
		onZoomLevel: (level: number) => void;
		connectionUndoCount: number;
		connectionRedoCount: number;
		onUndoConnection: () => void;
		onRedoConnection: () => void;
		onFit: () => void;
		onRefresh: () => void;
		settingsPanel: SettingsPanelMode | undefined;
		onSettingsPanel: (panel: SettingsPanelMode, event: MouseEvent) => void;
		showDebugButton: boolean;
		debugOpen: boolean;
		onToggleDebug: () => void;
		shortcutsOpen: boolean;
		onShowShortcuts: () => void;
	} = $props();

	let pickerOpen = $state(false);
	let configOpen = $state(false);
	let createOpen = $state(false);
	let viewSearch = $state('');
	let nodeSearch = $state('');
	let draftName = $state('');
	let createType = $state<ViewMode | undefined>(undefined);
	let createSource = $state<ChartSource>('query');
	let createName = $state('');
	let createNameEdited = $state(false);
	let zoomInput = $state('100');
	let zoomInputFocused = $state(false);

	$effect(() => {
		if (!zoomInputFocused) {
			zoomInput = `${Math.round(zoomLevel)}%`;
		}
	});

	const activeChart = $derived(
		charts.find((chart) => chart.id === activeChartId) ?? charts[0],
	);
	const filteredCharts = $derived(
		charts.filter((chart) =>
			chart.name
				.toLocaleLowerCase()
				.includes(viewSearch.toLocaleLowerCase()),
		),
	);
	const nodeSearchOptions = $derived(
		searchNodes.map((node) => ({
			value: node.id,
			label: node.title,
			detail: formatNodeSearchDetail(node),
			searchText: [node.title, node.path, ...(node.aliases ?? [])].join(
				' ',
			),
		})),
	);
	const VIEW_ICONS: Record<ViewMode, IconName> = {
		graph: 'grip',
		'graph-3d': 'scale-3d',
		cube: 'box',
		free: 'move',
		flow: 'network',
		arc: 'rainbow',
		'hierarchical-edge-bundling': 'diameter',
	};
	const VIEW_MODE_OPTIONS = CHART_TYPE_ORDER.map((value) => ({
		value,
		label: CHART_TYPE_DEFINITIONS[value].name,
		tooltip: CHART_TYPE_DEFINITIONS[value].description,
	}));
	const SOURCE_OPTIONS: Array<{ value: ChartSource; label: string }> = [
		{ value: 'query', label: 'Query' },
		{ value: 'curated', label: 'Curated' },
	];
	const SETTINGS_TABS = $derived<
		Array<{
			mode: SettingsPanelMode;
			icon: IconName;
			label: string;
		}>
	>([
		{ mode: 'graph', icon: 'sliders-horizontal', label: 'Graph' },
		...(chartSource === 'query'
			? [
					{
						mode: 'filters',
						icon: 'list-filter',
						label: 'Filter',
					} as const,
				]
			: []),
		{ mode: 'groups', icon: 'group', label: 'Group' },
		{ mode: 'text-style', icon: 'type', label: 'Text style' },
		{ mode: 'note-style', icon: 'palette', label: 'Note style' },
		{ mode: 'link-style', icon: 'route', label: 'Link style' },
	]);
	function getViewIcon(type: ViewMode | undefined): IconName {
		return VIEW_ICONS[type ?? 'graph'];
	}

	function obsidianIcon(node: HTMLElement, icon: IconName) {
		setIcon(node, icon);

		return {
			update(nextIcon: IconName) {
				setIcon(node, nextIcon);
			},
		};
	}

	function obsidianTooltip(node: HTMLElement, tooltip: string) {
		setTooltip(node, tooltip, { placement: 'top' });

		return {
			update(nextTooltip: string) {
				setTooltip(node, nextTooltip, { placement: 'top' });
			},
		};
	}

	function togglePicker(): void {
		pickerOpen = !pickerOpen;
		configOpen = false;
		createOpen = false;
		viewSearch = '';
	}

	function openConfig(): void {
		if (readOnly) return;
		draftName = activeChart?.name ?? '';
		configOpen = true;
		createOpen = false;
		pickerOpen = false;
	}

	function closeConfig(): void {
		configOpen = false;
	}

	async function selectChart(id: string): Promise<void> {
		pickerOpen = false;
		await onSelectChart(id);
	}

	async function configureChart(id: string): Promise<void> {
		if (readOnly) return;
		pickerOpen = false;
		await onSelectChart(id);
		window.requestAnimationFrame(() => openConfig());
	}

	function openCreate(): void {
		if (readOnly) return;
		createType = undefined;
		createSource = 'query';
		createName = '';
		createNameEdited = false;
		createOpen = true;
		configOpen = false;
		pickerOpen = false;
	}

	function closeCreate(): void {
		createOpen = false;
	}

	function selectCreateType(type: ViewMode): void {
		createType = type;
		if (!createNameEdited) {
			createName = getUniqueChartName(type);
		}
	}

	function getUniqueChartName(type: ViewMode): string {
		const baseName = getChartTypeName(type);
		const existingNames = new Set(charts.map((chart) => chart.name));
		let name = baseName;
		let index = 2;
		while (existingNames.has(name)) {
			name = `${baseName} ${index}`;
			index += 1;
		}
		return name;
	}

	function createChart(): void {
		if (readOnly) return;
		const name = createName.trim();
		if (!createType || !name) {
			return;
		}
		onCreateChart({ type: createType, source: createSource, name });
		closeCreate();
	}

	function handleCreateKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && createType && createName.trim()) {
			event.preventDefault();
			createChart();
		}
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.key !== 'Escape') return;
		if (!createOpen && !configOpen && !pickerOpen) return;
		event.preventDefault();
		event.stopPropagation();
		if (createOpen) closeCreate();
		else if (configOpen) closeConfig();
		else pickerOpen = false;
	}

	function commitName(): void {
		if (readOnly) return;
		onRenameChart(draftName);
	}

	function formatNodeSearchDetail(node: KnowledgeNode): string {
		return node.aliases && node.aliases.length > 0
			? `${node.path} · ${node.aliases.join(', ')}`
			: node.path;
	}

	function focusSearchNode(nodeId: string): void {
		onFocusNode(nodeId);
	}

	function commitZoomInput(): void {
		zoomInputFocused = false;
		const value = Number(zoomInput.replace('%', '').trim());
		if (!Number.isFinite(value)) {
			zoomInput = `${Math.round(zoomLevel)}%`;
			return;
		}
		onZoomLevel(Math.min(400, Math.max(25, value)));
	}

	function handleZoomInputKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		(event.currentTarget as HTMLInputElement).blur();
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#snippet layoutSelector(
	selectedMode: ViewMode | undefined,
	onSelect: (mode: ViewMode) => void,
)}
	<div class="knowledge-workspace-create-field">
		<span
			id="knowledge-workspace-layout-label"
			class="knowledge-workspace-create-label">Layout</span
		>
		<div
			class="knowledge-workspace-create-layout"
			role="radiogroup"
			aria-labelledby="knowledge-workspace-layout-label"
		>
			{#each VIEW_MODE_OPTIONS as option}
				<button
					type="button"
					class:active={selectedMode === option.value}
					role="radio"
					aria-checked={selectedMode === option.value}
					aria-label={option.tooltip}
					use:obsidianTooltip={option.tooltip}
					onclick={() => onSelect(option.value)}
				>
					<span
						class="knowledge-workspace-create-layout-icon"
						use:obsidianIcon={getViewIcon(option.value)}
						aria-hidden="true"
					></span>
					<span>{option.label}</span>
				</button>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet sourceSelector(
	selectedSource: ChartSource,
	onSelect: (source: ChartSource) => void,
)}
	<div class="knowledge-workspace-create-field">
		<span class="knowledge-workspace-create-label">Source</span>
		<div
			class="knowledge-workspace-segmented knowledge-workspace-create-source"
		>
			{#each SOURCE_OPTIONS as option}
				<ObsidianButton
					active={selectedSource === option.value}
					text={option.label}
					onClick={() => onSelect(option.value)}
				/>
			{/each}
		</div>
	</div>
{/snippet}

<div class="knowledge-workspace-toolbar">
	<div class="knowledge-workspace-view-switcher">
		<button
			class="knowledge-workspace-view-trigger"
			aria-haspopup="menu"
			aria-expanded={pickerOpen}
			onclick={togglePicker}
		>
			<span
				class:curated={activeChart?.source === 'curated'}
				class="knowledge-workspace-view-icon"
				use:obsidianIcon={getViewIcon(activeChart?.type)}
				aria-hidden="true"
			></span>
			<span class="knowledge-workspace-view-name"
				>{activeChart?.name ?? 'View'}</span
			>
			<span class="knowledge-workspace-view-caret" aria-hidden="true"
			></span>
		</button>
		<ObsidianButton
			class="knowledge-workspace-view-config-button"
			active={configOpen}
			disabled={readOnly}
			icon="settings-2"
			ariaLabel="Workspace settings"
			onClick={() => openConfig()}
		/>

		{#if pickerOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="knowledge-workspace-view-config-backdrop"
				onpointerdown={togglePicker}
				oncontextmenu={(e) => {
					e.preventDefault();
					togglePicker();
				}}
			></div>
			<div class="knowledge-workspace-view-menu" role="menu">
				<label class="knowledge-workspace-view-search">
					<span aria-hidden="true"></span>
					<ObsidianTextInput
						type="search"
						placeholder="Search views..."
						value={viewSearch}
						onInput={(value) => {
							viewSearch = value;
						}}
					/>
				</label>
				<div class="knowledge-workspace-view-list">
					{#each filteredCharts as chart (chart.id)}
						<div
							class:active={chart.id === activeChartId}
							class:curated={chart.source === 'curated'}
							class="knowledge-workspace-view-row"
						>
							<button
								role="menuitem"
								onclick={() => selectChart(chart.id)}
							>
								<span
									class:curated={chart.source === 'curated'}
									class="knowledge-workspace-view-icon"
									use:obsidianIcon={getViewIcon(chart.type)}
									aria-hidden="true"
								></span>
								<span>{chart.name}</span>
							</button>
							<ObsidianButton
								class="knowledge-workspace-view-row-config"
								disabled={readOnly}
								ariaLabel={`Configure ${chart.name}`}
								icon="chevron-right"
								onClick={() => configureChart(chart.id)}
							/>
						</div>
					{/each}
				</div>
				<ObsidianButton
					class="knowledge-workspace-add-view"
					disabled={readOnly}
					role="menuitem"
					icon="plus"
					text="Add view"
					onClick={openCreate}
				/>
			</div>
		{/if}

		{#if createOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="knowledge-workspace-view-config-backdrop"
				onpointerdown={closeCreate}
				oncontextmenu={(event) => {
					event.preventDefault();
					closeCreate();
				}}
			></div>
			<div
				class="knowledge-workspace-view-config knowledge-workspace-view-create"
				role="dialog"
				aria-modal="true"
				aria-labelledby="knowledge-workspace-create-view-title"
			>
				<header>
					<ObsidianButton
						class="knowledge-workspace-icon-button back"
						ariaLabel="Back to views"
						icon="arrow-left"
						onClick={() => {
							closeCreate();
							pickerOpen = true;
						}}
					/>
					<div id="knowledge-workspace-create-view-title">
						Create view
					</div>
					<ObsidianButton
						class="knowledge-workspace-icon-button close"
						ariaLabel="Close"
						icon="x"
						onClick={closeCreate}
					/>
				</header>
				{@render layoutSelector(createType, selectCreateType)}
				<label class="knowledge-workspace-create-field">
					<span>Name</span>
					<ObsidianTextInput
						class="knowledge-workspace-view-title-input"
						type="text"
						value={createName}
						onInput={(value) => {
							createName = value;
							createNameEdited = true;
						}}
						onKeydown={handleCreateKeydown}
					/>
				</label>
				{@render sourceSelector(
					createSource,
					(source) => (createSource = source),
				)}
				<div class="knowledge-workspace-create-actions">
					<ObsidianButton text="Cancel" onClick={closeCreate} />
					<ObsidianButton
						text="Create view"
						cta={true}
						disabled={!createType || !createName.trim()}
						onClick={createChart}
					/>
				</div>
			</div>
		{/if}

		{#if configOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="knowledge-workspace-view-config-backdrop"
				onpointerdown={closeConfig}
				oncontextmenu={(e) => {
					e.preventDefault();
					closeConfig();
				}}
			></div>
			<div
				class="knowledge-workspace-view-config knowledge-workspace-view-create"
				role="dialog"
				aria-labelledby="knowledge-workspace-configure-view-title"
			>
				<header>
					<ObsidianButton
						class="knowledge-workspace-icon-button back"
						ariaLabel="Back to views"
						icon="arrow-left"
						onClick={() => {
							configOpen = false;
							pickerOpen = true;
						}}
					/>
					<div id="knowledge-workspace-configure-view-title">
						Configure view
					</div>
					<ObsidianButton
						class="knowledge-workspace-icon-button close"
						ariaLabel="Close"
						icon="x"
						onClick={closeConfig}
					/>
				</header>
				{@render layoutSelector(mode, onChartType)}
				<label class="knowledge-workspace-create-field">
					<span>Name</span>
					<ObsidianTextInput
						class="knowledge-workspace-view-title-input"
						type="text"
						value={draftName}
						onInput={(value) => {
							draftName = value;
						}}
						onBlur={commitName}
					/>
				</label>
				{@render sourceSelector(chartSource, onChartSource)}
				<ObsidianButton
					class="knowledge-workspace-delete-view"
					disabled={charts.length <= 1}
					text="Delete view"
					destructive={true}
					onClick={() => {
						onDeleteChart();
						closeConfig();
					}}
				/>
			</div>
		{/if}
	</div>
	<div class="knowledge-workspace-settings-tabs">
		{#each SETTINGS_TABS as tab}
			<ObsidianButton
				active={settingsPanel === tab.mode}
				disabled={readOnly}
				icon={tab.icon}
				text={tab.label}
				onClick={(event) => onSettingsPanel(tab.mode, event)}
			/>
		{/each}
	</div>
	<div class="knowledge-workspace-node-search">
		<ObsidianSuggestInput
			{app}
			type="search"
			placeholder="Find note..."
			ariaLabel="Find note"
			value={nodeSearch}
			options={nodeSearchOptions}
			onInput={(value) => {
				nodeSearch = value;
			}}
			onSelect={(option) => {
				focusSearchNode(option.value);
				nodeSearch = '';
			}}
			onInputEl={onFindNoteInputEl}
		/>
	</div>
	<div class="knowledge-workspace-graph-actions">
		<div
			class="knowledge-workspace-zoom-controls"
			role="group"
			aria-label="Zoom controls"
		>
			<div class="knowledge-workspace-segmented">
				<ObsidianButton
					icon="zoom-out"
					ariaLabel="Zoom out"
					tooltip="Zoom out"
					onClick={onZoomOut}
				/>
				<ObsidianButton
					icon="zoom-in"
					ariaLabel="Zoom in"
					tooltip="Zoom in"
					onClick={onZoomIn}
				/>
			</div>
			<div class="knowledge-workspace-zoom-input">
				<ObsidianTextInput
					type="text"
					value={zoomInput}
					ariaLabel="Zoom percentage"
					onInput={(value) => (zoomInput = value)}
					onFocus={() => {
						zoomInputFocused = true;
						zoomInput = String(Math.round(zoomLevel));
					}}
					onBlur={commitZoomInput}
					onKeydown={handleZoomInputKeydown}
				/>
			</div>
			<ObsidianSlider
				value={Math.round(zoomLevel)}
				min={25}
				max={400}
				step={5}
				showValue={false}
				onChange={onZoomLevel}
			/>
		</div>
		<span class="knowledge-workspace-toolbar-connection-undo">
			<ObsidianButton
				icon="undo-2"
				ariaLabel="Undo last connection"
				tooltip="Undo connection (Ctrl+Z)"
				disabled={connectionUndoCount === 0}
				onClick={onUndoConnection}
			/>
			{#if connectionUndoCount > 0}
				<span class="knowledge-workspace-toolbar-action-count"
					>{connectionUndoCount}</span
				>
			{/if}
		</span>
		<ObsidianButton
			icon="redo-2"
			ariaLabel="Redo last connection"
			tooltip="Redo connection (Ctrl+Shift+Z or Ctrl+Y)"
			disabled={connectionRedoCount === 0}
			onClick={onRedoConnection}
		/>
		<ObsidianButton
			class="knowledge-workspace-toolbar-fit"
			icon="crosshair"
			text="Fit graph"
			ariaLabel="Fit graph"
			tooltip="Fit graph"
			onClick={onFit}
		/>
		<ObsidianButton
			class="knowledge-workspace-toolbar-refresh"
			icon="refresh-cw"
			text="Refresh"
			ariaLabel="Refresh graph"
			tooltip="Refresh graph"
			onClick={onRefresh}
		/>
		{#if showDebugButton}
			<ObsidianButton
				active={debugOpen}
				text="Debug"
				onClick={onToggleDebug}
			/>
		{/if}
		<ObsidianButton
			icon="circle-help"
			active={shortcutsOpen}
			ariaLabel="Keyboard shortcuts"
			tooltip="Keyboard shortcuts (?)"
			onClick={onShowShortcuts}
		/>
	</div>
</div>
