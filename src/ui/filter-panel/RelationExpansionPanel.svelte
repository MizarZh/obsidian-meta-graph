<script lang="ts">
	import type { App } from 'obsidian';
	import type { GraphQuery, RelationExpansion } from '@/core/types';
	import RelationExpansionControls from '@/ui/filter-panel/RelationExpansionControls.svelte';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import ObsidianSuggestInput from '@/ui/obsidian/ObsidianSuggestInput.svelte';
	import ObsidianToggle from '@/ui/obsidian/ObsidianToggle.svelte';

	let {
		app,
		query,
		fields,
		coreCount,
		contextCount,
		onChange,
	}: {
		app: App;
		query: GraphQuery;
		fields: string[];
		coreCount: number;
		contextCount: number;
		onChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
	} = $props();

	const expansion: RelationExpansion = $derived(
		query.relationExpansion ?? {
			enabled: false,
			allFields: true,
			fields: [],
			direction: 'both',
			depth: 1,
		},
	);
	const options = $derived(
		fields
			.filter((field) => !expansion.fields.includes(field))
			.map((field) => ({ value: field, label: field })),
	);

	function update(patch: Partial<RelationExpansion>): void {
		onChange({ relationExpansion: { ...expansion, ...patch } });
	}
	function fieldRule(field: string) {
		return (
			expansion.fieldRules?.find((rule) => rule.field === field) ?? {
				field,
				direction: expansion.direction,
				depth: expansion.depth,
			}
		);
	}

	function updateField(
		field: string,
		patch: Partial<Pick<RelationExpansion, 'direction' | 'depth'>>,
	): void {
		update({
			fieldRules: expansion.fields.map((name) => ({
				...fieldRule(name),
				...(name === field ? patch : {}),
			})),
		});
	}

	function addField(field: string): void {
		update({
			fields: [...expansion.fields, field],
			fieldRules: [
				...expansion.fields.map(fieldRule),
				{
					field,
					direction: expansion.direction,
					depth: expansion.depth,
				},
			],
		});
	}
</script>

<section
	class="knowledge-workspace-filter-scope knowledge-workspace-relation-expansion"
>
	<header>
		<h3>Related context · This view</h3>
		<ObsidianToggle
			value={expansion.enabled}
			ariaLabel="Expand related context in this view"
			onChange={(enabled) => update({ enabled })}
		/>
	</header>
	{#if expansion.enabled}
		<div class="knowledge-workspace-expansion-row">
			<span>Show context badges</span>
			<ObsidianToggle
				value={expansion.showBadges !== false}
				ariaLabel="Show context badges"
				onChange={(showBadges) => update({ showBadges })}
			/>
		</div>
		<div class="knowledge-workspace-expansion-row">
			<span>Relationship fields</span>
			<ObsidianDropdown
				value={expansion.allFields ? 'all' : 'selected'}
				ariaLabel="Relationship fields"
				options={[
					{ value: 'all', label: 'All relationship fields' },
					{ value: 'selected', label: 'Selected fields' },
				]}
				onChange={(value) =>
					update({
						allFields: value === 'all',
						fieldRules: expansion.fields.map(fieldRule),
					})}
			/>
		</div>
		{#if expansion.allFields}
			<RelationExpansionControls
				scope="All relationship fields"
				direction={expansion.direction}
				depth={expansion.depth}
				onChange={update}
			/>
		{:else}
			<div class="knowledge-workspace-expansion-rules">
				{#each expansion.fields as field (field)}
					<section
						class="knowledge-workspace-expansion-rule"
						aria-label={field}
					>
						<strong class="knowledge-workspace-expansion-rule-name"
							>{field}</strong
						>
						<RelationExpansionControls
							scope={field}
							direction={fieldRule(field).direction}
							depth={fieldRule(field).depth}
							onChange={(patch) => updateField(field, patch)}
						/>
						<ObsidianButton
							icon="x"
							ariaLabel={`Remove ${field}`}
							tooltip={`Remove ${field}`}
							onClick={() =>
								update({
									fields: expansion.fields.filter(
										(item) => item !== field,
									),
									fieldRules: expansion.fields
										.filter((item) => item !== field)
										.map(fieldRule),
								})}
						/>
					</section>
				{/each}
			</div>
			{#key expansion.fields.join('\u001f')}
				<ObsidianSuggestInput
					{app}
					value=""
					{options}
					showOnEmpty={true}
					allowCustom={false}
					placeholder="Add relationship field…"
					ariaLabel="Add relationship field"
					onSelect={({ value }) => addField(value)}
				/>
			{/key}
		{/if}
		<p class="setting-item-description" aria-live="polite">
			Core {coreCount} · Added {contextCount} · Node limit {query.maxNodes}
		</p>
	{/if}
</section>
