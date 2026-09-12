<script lang="ts">
	import type { WorkspaceState } from '@/core/types';
	import StylePreview from '@/ui/settings/style/StylePreview.svelte';
	import { buildGraphLegend } from '@/ui/workspace/graph-legend';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import { LEGEND_BADGES } from '@/ui/workspace/legend-badges';
	let {
		embedded = false,
		state: workspaceState,
		metadataFields,
		metadataTypes,
	}: {
		embedded?: boolean;
		state: WorkspaceState;
		metadataFields: string[];
		metadataTypes: Record<string, string>;
	} = $props();
	const legend = $derived(
		buildGraphLegend(workspaceState, metadataFields, metadataTypes),
	);
	let open = $state(true);
</script>

<div class="knowledge-workspace-legend-position">
	<aside class="knowledge-workspace-legend" aria-label="Graph legend">
		{#if !embedded}
			<ObsidianButton
				text="Legend"
				icon={open ? 'chevron-down' : 'chevron-up'}
				ariaExpanded={open}
				onClick={() => (open = !open)}
			/>
		{/if}
		{#if open}
			<div class="knowledge-workspace-legend-content">
				<h4>Node status</h4>
				<ul class="knowledge-workspace-legend-badges">
					{#each LEGEND_BADGES as badge}
						<li>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"><path d={badge.path} /></svg
							>
							<span>{badge.label}</span>
						</li>
					{/each}
				</ul>
				{#each [{ name: 'Nodes', entries: legend.nodes }, { name: 'Links', entries: legend.links }] as section}
					<section>
						<h4>{section.name}</h4>
						<ul>
							{#each section.entries as entry (entry.id)}
								<li
									title={`${entry.name}\n${entry.scope}: ${entry.condition}${entry.line?.hidden ? ' (Hidden)' : ''}`}
								>
									<span
										class="knowledge-workspace-legend-preview"
									>
										<StylePreview
											color={entry.node?.color ??
												entry.line?.color ??
												''}
											nodeShape={entry.node?.shape}
											linePreview={entry.line}
										/>
									</span>
									<span
										class="knowledge-workspace-legend-name"
										>{entry.name}</span
									>
									<small
										>{entry.line?.hidden
											? 'Hidden'
											: entry.scope}</small
									>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	</aside>
</div>
