<script lang="ts">
	import type { ChartGroup, ManualLayoutConfig } from "../core/types";
	import ObsidianButton from "./obsidian/ObsidianButton.svelte";
	import ObsidianDropdown from "./obsidian/ObsidianDropdown.svelte";
	import ObsidianTextInput from "./obsidian/ObsidianTextInput.svelte";

	let {
		manualLayout,
		onAddGroup,
		onUpdateGroup,
		onDeleteGroup,
	}: {
		manualLayout: ManualLayoutConfig;
		onAddGroup: () => void;
		onUpdateGroup: (groupId: string, patch: Partial<ChartGroup>) => void;
		onDeleteGroup: (groupId: string) => void;
	} = $props();

	const MODE_OPTIONS = [
		{ value: "manual", label: "Manual" },
		{ value: "rule", label: "Rule" },
	];

	const memberCounts = $derived.by(() => {
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

	function updateNumber(
		group: ChartGroup,
		field: "x" | "y" | "width" | "height" | "padding",
		value: string,
	): void {
		const nextValue = Number(value);
		if (Number.isFinite(nextValue)) {
			onUpdateGroup(group.id, { [field]: nextValue });
		}
	}
</script>

<aside class="knowledge-workspace-filters knowledge-workspace-groups">
	<section>
		<header>
			<div>
				<h3>Groups</h3>
				<p>Organize visible notes into chart-local regions.</p>
			</div>
			<ObsidianButton
				icon="plus"
				text="Add group"
				onClick={onAddGroup}
			/>
		</header>

		{#if manualLayout.groups.length === 0}
			<div class="knowledge-workspace-group-empty">No groups</div>
		{:else}
			<div class="knowledge-workspace-group-list">
				{#each manualLayout.groups as group (group.id)}
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
									onChange={(value) =>
										onUpdateGroup(group.id, { name: value })}
								/>
							</label>
							<ObsidianButton
								icon="trash-2"
								ariaLabel={`Delete ${group.name}`}
								destructive={true}
								onClick={() => onDeleteGroup(group.id)}
							/>
						</header>

						<div class="knowledge-workspace-group-meta">
							<span>{memberCounts.get(group.id) ?? 0} nodes</span>
							<span>{group.mode === "rule" ? "Rule group" : "Manual group"}</span>
						</div>

						<div class="knowledge-workspace-group-grid">
							<label>
								<span>Color</span>
								<input
									type="color"
									value={group.color}
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
									onChange={(value) =>
										onUpdateGroup(group.id, {
											mode: value === "rule" ? "rule" : "manual",
										})}
								/>
							</label>
							<label>
								<span>X</span>
								<ObsidianTextInput
									type="number"
									value={group.x}
									step="0.1"
									onChange={(value) => updateNumber(group, "x", value)}
								/>
							</label>
							<label>
								<span>Y</span>
								<ObsidianTextInput
									type="number"
									value={group.y}
									step="0.1"
									onChange={(value) => updateNumber(group, "y", value)}
								/>
							</label>
							<label>
								<span>Width</span>
								<ObsidianTextInput
									type="number"
									min="0.8"
									step="0.1"
									value={group.width}
									onChange={(value) => updateNumber(group, "width", value)}
								/>
							</label>
							<label>
								<span>Height</span>
								<ObsidianTextInput
									type="number"
									min="0.6"
									step="0.1"
									value={group.height}
									onChange={(value) => updateNumber(group, "height", value)}
								/>
							</label>
							<label>
								<span>Padding</span>
								<ObsidianTextInput
									type="number"
									min="0"
									step="0.01"
									value={group.padding}
									onChange={(value) => updateNumber(group, "padding", value)}
								/>
							</label>
						</div>

						{#if group.mode === "rule"}
							<p class="knowledge-workspace-group-note">
								Rule membership uses the saved rule model. Rule editor comes next.
							</p>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>
</aside>
