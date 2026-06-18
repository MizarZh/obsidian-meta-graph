<script lang="ts">
	import type { GraphQuery, RelationType } from '../core/types';

	let {
		query,
		folders,
		domains,
		onChange,
	}: {
		query: GraphQuery;
		folders: string[];
		domains: string[];
		onChange: (patch: Partial<Omit<GraphQuery, 'roots'>>) => void;
	} = $props();

	const relations: Array<{ value: RelationType; label: string }> = [
		{ value: 'prerequisite', label: 'Prerequisite' },
		{ value: 'leads-to', label: 'Leads to' },
		{ value: 'related', label: 'Related' },
	];

	function toggle(
		key: 'folders' | 'domains' | 'relations',
		value: string,
		checked: boolean,
	): void {
		const current = query[key] as string[];
		const next = checked
			? [...current, value]
			: current.filter((item) => item !== value);
		onChange({ [key]: next });
	}
</script>

<aside class="knowledge-workspace-filters">
	<h3>Filters</h3>

	<fieldset>
		<legend>Relations</legend>
		{#each relations as relation}
			<label class="checkbox">
				<input
					type="checkbox"
					checked={query.relations.includes(relation.value)}
					onchange={(event) =>
						toggle(
							'relations',
							relation.value,
							event.currentTarget.checked,
						)}
				/>
				<span>{relation.label}</span>
			</label>
		{/each}
	</fieldset>

	{#if domains.length > 0}
		<fieldset>
			<legend>Domains</legend>
			{#each domains as domain}
				<label class="checkbox">
					<input
						type="checkbox"
						checked={query.domains.includes(domain)}
						onchange={(event) =>
							toggle('domains', domain, event.currentTarget.checked)}
					/>
					<span>{domain}</span>
				</label>
			{/each}
		</fieldset>
	{/if}

	{#if folders.length > 0}
		<fieldset>
			<legend>Folders</legend>
			{#each folders as folder}
				<label class="checkbox">
					<input
						type="checkbox"
						checked={query.folders.includes(folder)}
						onchange={(event) =>
							toggle('folders', folder, event.currentTarget.checked)}
					/>
					<span>{folder}</span>
				</label>
			{/each}
		</fieldset>
	{/if}
</aside>
