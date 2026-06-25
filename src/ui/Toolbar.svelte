<script lang="ts">
	import { setIcon, type App, type IconName } from "obsidian";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";
	import ObsidianDropdown from "./obsidian/ObsidianDropdown.svelte";
	import ObsidianSuggestInput from "./obsidian/ObsidianSuggestInput.svelte";
	import ObsidianTextInput from "./obsidian/ObsidianTextInput.svelte";
	import type {
		ChartSource,
		KnowledgeNode,
		MetaGraphChart,
		SettingsPanelMode,
		ViewMode,
	} from "../core/types";

	let {
		app,
		mode,
		chartSource,
		charts,
		activeChartId,
		searchNodes,
		onSelectChart,
		onAddChart,
		onRenameChart,
		onChartType,
		onChartSource,
		onDeleteChart,
		onFocusNode,
		onFit,
		onRefresh,
		settingsPanel,
		onSettingsPanel,
		showDebugButton,
		debugOpen,
		onToggleDebug,
	}: {
		app: App;
		mode: ViewMode;
		chartSource: ChartSource;
		charts: MetaGraphChart[];
		activeChartId: string;
		searchNodes: KnowledgeNode[];
		onSelectChart: (id: string) => void;
		onAddChart: () => void;
		onRenameChart: (name: string) => void;
		onChartType: (mode: ViewMode) => void;
		onChartSource: (source: ChartSource) => void;
		onDeleteChart: () => void;
		onFocusNode: (id: string) => void;
		onFit: () => void;
		onRefresh: () => void;
		settingsPanel: SettingsPanelMode | undefined;
		onSettingsPanel: (panel: SettingsPanelMode, event: MouseEvent) => void;
		showDebugButton: boolean;
		debugOpen: boolean;
		onToggleDebug: () => void;
	} = $props();

	let pickerOpen = $state(false);
	let configOpen = $state(false);
	let creatingView = $state(false);
	let viewSearch = $state("");
	let nodeSearch = $state("");
	let draftName = $state("");

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
				" ",
			),
		})),
	);
	const VIEW_ICONS: Record<ViewMode, IconName> = {
		graph: "chart-scatter",
		flow: "git-fork",
		arc: "route",
	};
	const VIEW_MODE_OPTIONS = [
		{ value: "graph", label: "Graph" },
		{ value: "flow", label: "Flow" },
		{ value: "arc", label: "Arc diagram" },
	];
	const SOURCE_OPTIONS = [
		{ value: "query", label: "Query" },
		{ value: "curated", label: "Workspace" },
	];
	const SETTINGS_TABS = $derived<Array<{
		mode: SettingsPanelMode;
		icon: IconName;
		label: string;
	}>>([
		{ mode: "graph", icon: "settings-2", label: "Graph" },
		...(chartSource === "query"
			? [{ mode: "filters", icon: "list-filter", label: "Filter" } as const]
			: []),
		{ mode: "text-style", icon: "type", label: "Text style" },
		{ mode: "note-style", icon: "palette", label: "Note style" },
		{ mode: "link-style", icon: "route", label: "Link style" },
	]);

	function getViewIcon(type: ViewMode | undefined): IconName {
		return VIEW_ICONS[type ?? "graph"];
	}

	function obsidianIcon(node: HTMLElement, icon: IconName) {
		setIcon(node, icon);

		return {
			update(nextIcon: IconName) {
				setIcon(node, nextIcon);
			},
		};
	}

	function togglePicker(): void {
		pickerOpen = !pickerOpen;
		configOpen = false;
		creatingView = false;
		viewSearch = "";
	}

	function openConfig(isCreating = false): void {
		draftName = activeChart?.name ?? "";
		configOpen = true;
		creatingView = isCreating;
		pickerOpen = false;
	}

	function closeConfig(): void {
		configOpen = false;
		creatingView = false;
	}

	function selectChart(id: string): void {
		onSelectChart(id);
		pickerOpen = false;
	}

	function configureChart(id: string): void {
		onSelectChart(id);
		pickerOpen = false;
		window.requestAnimationFrame(() => openConfig());
	}

	function addChart(): void {
		onAddChart();
		pickerOpen = false;
		window.requestAnimationFrame(() => openConfig(true));
	}

	function commitName(): void {
		onRenameChart(draftName);
	}

	function formatNodeSearchDetail(node: KnowledgeNode): string {
		return node.aliases && node.aliases.length > 0
			? `${node.path} · ${node.aliases.join(", ")}`
			: node.path;
	}

	function focusSearchNode(nodeId: string): void {
		onFocusNode(nodeId);
	}
</script>

<div class="knowledge-workspace-toolbar">
	<div class="knowledge-workspace-view-switcher">
		<button
			class="knowledge-workspace-view-trigger"
			aria-haspopup="menu"
			aria-expanded={pickerOpen}
			onclick={togglePicker}
		>
			<span
				class="knowledge-workspace-view-icon"
				use:obsidianIcon={getViewIcon(activeChart?.type)}
				aria-hidden="true"
			></span>
			<span class="knowledge-workspace-view-name"
				>{activeChart?.name ?? "View"}</span
			>
			<span class="knowledge-workspace-view-caret" aria-hidden="true"
			></span>
		</button>
		<ObsidianButton
			class="knowledge-workspace-view-config-button"
			active={configOpen}
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
							class="knowledge-workspace-view-row"
						>
							<button
								role="menuitem"
								onclick={() => selectChart(chart.id)}
							>
								<span
									class="knowledge-workspace-view-icon"
									use:obsidianIcon={getViewIcon(chart.type)}
									aria-hidden="true"
								></span>
								<span>{chart.name}</span>
							</button>
							<ObsidianButton
								class="knowledge-workspace-view-row-config"
								ariaLabel={`Configure ${chart.name}`}
								icon="chevron-right"
								onClick={() => configureChart(chart.id)}
							/>
						</div>
					{/each}
				</div>
				<ObsidianButton
					class="knowledge-workspace-add-view"
					role="menuitem"
					icon="plus"
					text="Add view"
					onClick={addChart}
				/>
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
				class="knowledge-workspace-view-config"
				role="dialog"
				aria-label="Configure view"
			>
				<header>
					<ObsidianButton
						class="knowledge-workspace-icon-button back"
						ariaLabel="Back to views"
						icon="arrow-left"
						onClick={() => {
							configOpen = false;
							creatingView = false;
							pickerOpen = true;
						}}
					/>
					<div>{creatingView ? "Create view" : "Configure view"}</div>
					<ObsidianButton
						class="knowledge-workspace-icon-button close"
						ariaLabel="Close"
						icon="x"
						onClick={closeConfig}
					/>
				</header>
				<ObsidianTextInput
					class="knowledge-workspace-view-title-input"
					type="text"
					value={draftName}
					onInput={(value) => {
						draftName = value;
					}}
					onBlur={commitName}
				/>
				<label>
					<span>Source</span>
					<ObsidianDropdown
						value={chartSource}
						options={SOURCE_OPTIONS}
						onChange={(value) =>
							onChartSource(value as ChartSource)}
					/>
				</label>
				<label>
					<span>Layout</span>
					<ObsidianDropdown
						value={mode}
						options={VIEW_MODE_OPTIONS}
						onChange={(value) => onChartType(value as ViewMode)}
					/>
				</label>
				{#if !creatingView}
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
				{/if}
			</div>
		{/if}
	</div>
	<div class="knowledge-workspace-settings-tabs">
		{#each SETTINGS_TABS as tab}
			<ObsidianButton
				active={settingsPanel === tab.mode}
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
				nodeSearch = "";
			}}
		/>
	</div>
	<div class="knowledge-workspace-graph-actions">
		<ObsidianButton text="Fit graph" onClick={onFit} />
		<ObsidianButton text="Refresh" onClick={onRefresh} />
		{#if showDebugButton}
			<ObsidianButton
				active={debugOpen}
				text="Debug"
				onClick={onToggleDebug}
			/>
		{/if}
	</div>
</div>
