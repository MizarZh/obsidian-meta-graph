<script lang="ts">
	import type { App } from 'obsidian';
	import type {
		ChartGroup,
		ChartGroupDefinition,
		ChartGroupingConfig,
		KnowledgeNode,
		ManualLayoutConfig,
		NodeFilterGroup,
	} from '../core/types';
	import { resolveChartGroupOwnership } from '../query/group-ownership';
	import NoteFilterEditor from './notes/NoteFilterEditor.svelte';
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from './obsidian/ObsidianDropdown.svelte';
	import ObsidianTextInput from './obsidian/ObsidianTextInput.svelte';

	let {
		app,
		grouping,
		manualLayout,
		nodes,
		folders,
		locked = false,
		disabled = false,
		geometryEditable = false,
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
		geometryEditable?: boolean;
		onAddGroup: () => void;
		onUpdateGroup: (groupId: string, patch: Partial<ChartGroup>) => void;
		onDeleteGroup: (groupId: string) => void;
		onReorderGroup: (groupId: string, direction: -1 | 1) => void;
	} = $props();

	const MODE_OPTIONS = [
		{ value: 'manual', label: 'Manual' },
		{ value: 'rule', label: 'Rule' },
	];

	const groups = $derived<ChartGroupDefinition[]>(
		locked ? manualLayout.groups : grouping.groups,
	);
	const manualGroupsById = $derived(
		new Map(manualLayout.groups.map((group) => [group.id, group])),
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
		field: 'x' | 'y' | 'width' | 'height' | 'padding',
		value: string,
	): void {
		const nextValue = Number(value);
		if (Number.isFinite(nextValue)) {
			onUpdateGroup(group.id, { [field]: nextValue });
		}
	}

	function updateMode(group: ChartGroupDefinition, value: string): void {
		const mode = value === 'rule' ? 'rule' : 'manual';
		onUpdateGroup(group.id, {
			mode,
			...(mode === 'rule' && !group.rule
				? { rule: createEmptyRule(group.id) }
				: {}),
		});
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
					{@const geometry = manualGroupsById.get(group.id)}
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

						<div class="knowledge-workspace-group-grid">
							<label>
								<span>Color</span>
								<input
									type="color"
									value={group.color}
									{disabled}
									oninput={(event) =>
										onUpdateGroup(group.id, {
											color: event.currentTarget.value,
										})}
								/>
							</label>
							<label>
								<span>Mode</span>
								<ObsidianDropdown
									value={group.mode}
									options={MODE_OPTIONS}
									{disabled}
									onChange={(value) =>
										updateMode(group, value)}
								/>
							</label>
							{#if geometryEditable && geometry}
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
								<label>
									<span>Width</span>
									<ObsidianTextInput
										type="number"
										min="0.8"
										step="0.1"
										value={geometry.width}
										{disabled}
										onChange={(value) =>
											updateNumber(group, 'width', value)}
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
							<label>
								<span>Padding</span>
								<ObsidianTextInput
									type="number"
									min="0"
									step="0.01"
									value={group.padding}
									{disabled}
									onChange={(value) =>
										updateNumber(group, 'padding', value)}
								/>
							</label>
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
