<script lang="ts">
	import type { WorkspaceState } from '@/core/types';
	import ObsidianButton from '@/ui/obsidian/ObsidianButton.svelte';
	import StylePreview from '@/ui/settings/style/StylePreview.svelte';
	import { buildGraphLegend } from '@/ui/workspace/graph-legend';
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
	let open = $state(true);
	const legend = $derived(
		buildGraphLegend(workspaceState, metadataFields, metadataTypes),
	);
</script>

<div class="knowledge-workspace-legend-position">
	<aside class="knowledge-workspace-legend" aria-label="Graph legend">
		{#if !embedded}
			<ObsidianButton
				text="Legend"
				active={open}
				ariaLabel={open ? 'Collapse legend' : 'Expand legend'}
				tooltip="Configured styles; rules may overlap."
				onClick={() => (open = !open)}
			/>
		{/if}
		{#if open}
			<div class="knowledge-workspace-legend-content">
				{#if workspaceState.projection?.nodes.some((node) => node.kind === 'unresolved' || node.isEmpty)}
					<section>
						<h4>Node status</h4>
						<ul>
							{#if workspaceState.projection?.nodes.some((node) => node.kind === 'unresolved')}
								<li>? · Unresolved note</li>
							{/if}
							{#if workspaceState.projection?.nodes.some((node) => node.kind !== 'unresolved' && node.isEmpty)}
								<li>
									<svg
										width="12"
										height="12"
										viewBox="0 0 12 12"
										fill="none"
										stroke="currentColor"
										stroke-width="1.25"
										stroke-linejoin="round"
										aria-hidden="true"
										><path
											d="M3 2h4l2 2v6H3V2M7 2v2h2"
										/></svg
									> Empty note
								</li>
							{/if}
						</ul>
					</section>
				{/if}
				{#if workspaceState.chartSource === 'query' && workspaceState.query.relationExpansion?.enabled && workspaceState.query.relationExpansion.showBadges !== false}
					<section>
						<h4>Related context · This view</h4>
						<ul>
							<li>Unmarked: Core match</li>
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
									aria-hidden="true"
								>
									<path
										d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"
									/>
								</svg>
								Added context
							</li>
						</ul>
					</section>
				{/if}
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
