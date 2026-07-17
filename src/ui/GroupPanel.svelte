<script lang="ts">
	import type { App } from 'obsidian';
	import { onMount } from 'svelte';
	import type {
		ChartGroup,
		ChartGroupDefinition,
		ChartGroupShape,
		ChartGroupingConfig,
		KnowledgeNode,
		ManualLayoutConfig,
		NodeFilterGroup,
	} from '../core/types';
	import { resolveChartGroupOwnership } from '../query/group-ownership';
	import { ThrottledCommitScheduler } from './filter/deferred-commit';
	import NoteFilterEditor from './notes/NoteFilterEditor.svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianColorInput from './obsidian/ObsidianColorInput.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from './obsidian/ObsidianSlider.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';

	let {
		app,
		grouping,
		manualLayout,
		nodes,
		folders,
		locked = false,
		disabled = false,
		manualModeAllowed = true,
		modeEditable = true,
		geometryEditable = false,
		shapeEditable = false,
		onAddGroup,
		onUpdateGroup,
		onDeleteGroup,
		onReorderGroup,
	}: {
		app: App;
		grouping: ChartGroupingConfig;
		manualLayout: ManualLayoutConfig;
		nodes: KnowledgeNode[];
		folders: string[];
		locked?: boolean;
		disabled?: boolean;
		manualModeAllowed?: boolean;
		modeEditable?: boolean;
		geometryEditable?: boolean;
		shapeEditable?: boolean;
		onAddGroup: () => void;
		onUpdateGroup: (groupId: string, patch: Partial<ChartGroup>) => void;
		onDeleteGroup: (groupId: string) => void;
		onReorderGroup: (groupId: string, direction: -1 | 1) => void;
	} = $props();

	const MODE_OPTIONS = [
		{ value: 'manual', label: 'Manual' },
		{ value: 'rule', label: 'Rule' },
	];
	const RULE_MODE_OPTIONS = [{ value: 'rule', label: 'Rule' }];
	const modeOptions = $derived(
		manualModeAllowed ? MODE_OPTIONS : RULE_MODE_OPTIONS,
	);
	const SHAPE_OPTIONS: Array<{
		value: ChartGroupShape;
		label: string;
	}> = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'circle', label: 'Circle' },
		{ value: 'rectangle', label: 'Rectangle' },
	];
	const PADDING_COMMIT_INTERVAL_MS = 120;
	let paddingCommitScheduler: ThrottledCommitScheduler | undefined;
	let paddingPreviews = $state<Record<string, number>>({});

	onMount(() => {
		paddingCommitScheduler = new ThrottledCommitScheduler(
			window,
			PADDING_COMMIT_INTERVAL_MS,
		);
		return () => paddingCommitScheduler?.clearAll();
	});

	const groups = $derived<ChartGroupDefinition[]>(
		locked ? manualLayout.groups : grouping.groups,
	);
	const groupFramesById = $derived(
		new Map([
			...manualLayout.groups.map(
				(group) =>
					[
						group.id,
						{
							x: group.x,
							y: group.y,
							width: group.width,
							height: group.height,
						},
					] as const,
			),
			...Object.entries(manualLayout.groupFrames ?? {}),
		]),
	);
	const ownership = $derived(resolveChartGroupOwnership(nodes, grouping));
	const memberCounts = $derived.by(() => {
		if (!locked) {
			return new Map(
				[...ownership.membersByGroup].map(([groupId, members]) => [
					groupId,
					members.length,
				]),
			);
		}
		const counts = new Map<string, number>();
		for (const placement of Object.values(manualLayout.nodes)) {
			if (placement.groupId) {
				counts.set(
					placement.groupId,
					(counts.get(placement.groupId) ?? 0) + 1,
				);
			}
		}
		return counts;
	});
	const conflictCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const conflict of ownership.conflicts) {
			for (const groupId of conflict.groupIds) {
				counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
			}
		}
		return counts;
	});

	function updateNumber(
		group: ChartGroupDefinition,
		field: 'x' | 'y' | 'width' | 'height',
		value: string,
	): void {
		const nextValue = Number(value);
		if (Number.isFinite(nextValue)) {
			onUpdateGroup(group.id, { [field]: nextValue });
		}
	}

	function updateDiameter(group: ChartGroupDefinition, value: string): void {
		const diameter = Number(value);
		if (Number.isFinite(diameter)) {
			onUpdateGroup(group.id, { width: diameter, height: diameter });
		}
	}

	function schedulePadding(group: ChartGroupDefinition, value: number): void {
		const padding = normalizePadding(value);
		paddingPreviews[group.id] = padding;
		const commit = (nextValue: string): void => {
			onUpdateGroup(group.id, { padding: Number(nextValue) });
		};
		if (!paddingCommitScheduler) {
			commit(String(padding));
			return;
		}
		paddingCommitScheduler.schedule(
			paddingCommitKey(group.id),
			String(group.padding),
			String(padding),
			commit,
		);
	}

	function commitPadding(group: ChartGroupDefinition, value: number): void {
		const padding = normalizePadding(value);
		paddingPreviews[group.id] = padding;
		const key = paddingCommitKey(group.id);
		const normalizedValue = String(padding);
		const commit = (nextValue: string): void => {
			onUpdateGroup(group.id, { padding: Number(nextValue) });
		};
		if (!paddingCommitScheduler) {
			commit(normalizedValue);
			return;
		}
		paddingCommitScheduler.commit(
			key,
			String(group.padding),
			normalizedValue,
			commit,
		);
		window.setTimeout(() => {
			if (paddingPreviews[group.id] === padding) {
				delete paddingPreviews[group.id];
			}
		}, 0);
	}

	function normalizePadding(value: number): number {
		return Math.min(5, Math.max(0, value));
	}

	function readPadding(group: ChartGroupDefinition): number {
		return paddingPreviews[group.id] ?? normalizePadding(group.padding);
	}

	function formatPadding(value: number): string {
		return value.toFixed(2).replace(/\.?0+$/u, '');
	}

	function paddingCommitKey(groupId: string): string {
		return `group:${groupId}:padding`;
	}

	function updateMode(group: ChartGroupDefinition, value: string): void {
		const mode =
			manualModeAllowed && value === 'manual' ? 'manual' : 'rule';
		onUpdateGroup(group.id, {
			mode,
			...(mode === 'rule' && !group.rule
				? { rule: createEmptyRule(group.id) }
				: {}),
		});
	}

	function updateShape(
		group: ChartGroupDefinition,
		shape: ChartGroupShape,
	): void {
		onUpdateGroup(group.id, { shape });
	}

	function createEmptyRule(groupId: string): NodeFilterGroup {
		return {
			id: `group-rule-${groupId}`,
			kind: 'group',
			mode: 'all',
			children: [],
		};
	}
</script>

<aside
	class="knowledge-workspace-filters knowledge-workspace-groups"
	class:knowledge-workspace-groups-disabled={disabled}
>
	<section>
		<header>
			<div>
				<h3>Groups</h3>
				{#if disabled}
					<p>Not available for this chart.</p>
				{:else if locked}
					<p>Six fixed face groups.</p>
				{/if}
			</div>
			{#if !locked && !disabled}
				<ObsidianButton
					icon="plus"
					text="Add group"
					onClick={onAddGroup}
				/>
			{/if}
		</header>

		{#if groups.length === 0}
			<div class="knowledge-workspace-group-empty">No groups</div>
		{:else}
			<div class="knowledge-workspace-group-list">
				{#each groups as group, index (group.id)}
					{@const geometry = groupFramesById.get(group.id)}
					<article class="knowledge-workspace-group-card">
						<header>
							<label class="knowledge-workspace-group-name">
								<span
									class="knowledge-workspace-group-color-dot"
									style:--knowledge-workspace-group-color={group.color}
									aria-hidden="true"
								></span>
								<ObsidianTextInput
									value={group.name}
									ariaLabel="Group name"
									{disabled}
									onChange={(value) =>
										onUpdateGroup(group.id, {
											name: value,
										})}
								/>
							</label>
							{#if !locked}
								<div class="knowledge-workspace-group-actions">
									<ObsidianButton
										icon="arrow-up"
										ariaLabel={`Move ${group.name} up`}
										tooltip="Move up"
										disabled={disabled || index === 0}
										onClick={() =>
											onReorderGroup(group.id, -1)}
									/>
									<ObsidianButton
										icon="arrow-down"
										ariaLabel={`Move ${group.name} down`}
										tooltip="Move down"
										disabled={disabled ||
											index === groups.length - 1}
										onClick={() =>
											onReorderGroup(group.id, 1)}
									/>
									<ObsidianButton
										icon="trash-2"
										class="knowledge-workspace-group-delete"
										ariaLabel={`Delete ${group.name}`}
										tooltip="Delete group"
										{disabled}
										destructive={true}
										onClick={() => onDeleteGroup(group.id)}
									/>
								</div>
							{/if}
						</header>

						<div class="knowledge-workspace-group-meta">
							<span>{memberCounts.get(group.id) ?? 0} nodes</span>
							<span
								>{group.mode === 'rule'
									? 'Rule'
									: 'Manual'}</span
							>
							{#if (conflictCounts.get(group.id) ?? 0) > 0}
								<span
									>{conflictCounts.get(group.id)} conflicts</span
								>
							{/if}
						</div>

						<div class="knowledge-workspace-group-settings">
							<div
								class="knowledge-workspace-group-primary-settings"
							>
								<label
									class="knowledge-workspace-rule-label knowledge-workspace-group-color-setting"
								>
									<span>Color</span>
									<ObsidianColorInput
										value={group.color}
										commitKey={`group:${group.id}:color`}
										ariaLabel={`${group.name} color`}
										{disabled}
										onChange={(color) =>
											onUpdateGroup(group.id, {
												color,
											})}
									/>
								</label>
								{#if modeEditable}
									<label
										class="knowledge-workspace-rule-label knowledge-workspace-group-mode-setting"
									>
										<span>Mode</span>
										<ObsidianDropdown
											value={manualModeAllowed
												? group.mode
												: 'rule'}
											options={modeOptions}
											{disabled}
											onChange={(value) =>
												updateMode(group, value)}
										/>
									</label>
								{/if}
								{#if shapeEditable}
									<div
										class="knowledge-workspace-rule-label segmented knowledge-workspace-group-shape"
									>
										<span>Shape</span>
										<div
											class="knowledge-workspace-segmented"
										>
											{#each SHAPE_OPTIONS as option}
												<button
													type="button"
													class:active={(group.shape ??
														'auto') ===
														option.value}
													aria-pressed={(group.shape ??
														'auto') ===
														option.value}
													{disabled}
													onclick={() =>
														updateShape(
															group,
															option.value,
														)}
												>
													{option.label}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
							<label
								class="knowledge-workspace-rule-label knowledge-workspace-group-padding"
							>
								<span>Padding</span>
								<div class="knowledge-workspace-slider-value">
									<ObsidianSlider
										min={0}
										max={5}
										step={0.05}
										value={readPadding(group)}
										format={formatPadding}
										{disabled}
										onChange={(value) =>
											schedulePadding(group, value)}
										onCommit={(value) =>
											commitPadding(group, value)}
									/>
									<span
										>{formatPadding(
											readPadding(group),
										)}</span
									>
								</div>
							</label>
							{#if geometryEditable && geometry}
								<div
									class="knowledge-workspace-rule-row compact knowledge-workspace-group-geometry"
								>
									<label>
										<span>X</span>
										<ObsidianTextInput
											type="number"
											value={geometry.x}
											step="0.1"
											{disabled}
											onChange={(value) =>
												updateNumber(group, 'x', value)}
										/>
									</label>
									<label>
										<span>Y</span>
										<ObsidianTextInput
											type="number"
											value={geometry.y}
											step="0.1"
											{disabled}
											onChange={(value) =>
												updateNumber(group, 'y', value)}
										/>
									</label>
									{#if group.shape === 'circle'}
										<label
											class="knowledge-workspace-group-diameter"
										>
											<span>Diameter</span>
											<ObsidianTextInput
												type="number"
												min="0.8"
												step="0.1"
												value={geometry.width}
												{disabled}
												onChange={(value) =>
													updateDiameter(
														group,
														value,
													)}
											/>
										</label>
									{:else}
										<label>
											<span>Width</span>
											<ObsidianTextInput
												type="number"
												min="0.8"
												step="0.1"
												value={geometry.width}
												{disabled}
												onChange={(value) =>
													updateNumber(
														group,
														'width',
														value,
													)}
											/>
										</label>
										<label>
											<span>Height</span>
											<ObsidianTextInput
												type="number"
												min="0.6"
												step="0.1"
												value={geometry.height}
												{disabled}
												onChange={(value) =>
													updateNumber(
														group,
														'height',
														value,
													)}
											/>
										</label>
									{/if}
								</div>
							{/if}
						</div>

						{#if group.mode === 'rule'}
							<NoteFilterEditor
								{app}
								{nodes}
								{folders}
								filterRoot={group.rule ??
									createEmptyRule(group.id)}
								onChange={(rule) =>
									onUpdateGroup(group.id, { rule })}
							/>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>
</aside>
