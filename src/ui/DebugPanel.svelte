<script lang="ts">
	import ObsidianButton from './obsidian/ObsidianButton.svelte';
	import type { DebugSnapshot } from '../core/types';

	let {
		snapshot,
		onRefresh,
	}: {
		snapshot: DebugSnapshot;
		onRefresh: () => void;
	} = $props();

	let copyLabel = $state('Copy JSON');
	const json = $derived(JSON.stringify(snapshot, null, 2));

	async function copyJson(): Promise<void> {
		try {
			await navigator.clipboard.writeText(json);
			copyLabel = 'Copied';
		} catch {
			copyLabel = 'Copy failed';
		}
	}
</script>

<section class="knowledge-workspace-debug">
	<header>
		<div>
			<h2>Debug data</h2>
			<p>
				{snapshot.index.nodeCount} indexed nodes,
				{snapshot.index.edgeCount} indexed edges,
				{snapshot.state.projection?.nodes.length ?? 0} projected nodes,
				{snapshot.state.projection?.edges.length ?? 0} projected edges
			</p>
		</div>
		<div class="knowledge-workspace-debug-actions">
			<ObsidianButton
				icon="refresh-cw"
				text="Refresh index"
				onClick={onRefresh}
			/>
			<ObsidianButton
				icon="copy"
				text={copyLabel}
				onClick={() => void copyJson()}
			/>
		</div>
	</header>

	{#if snapshot.unresolvedLinks.length > 0}
		<details open>
			<summary
				>Unresolved links ({snapshot.unresolvedLinks.length})</summary
			>
			<pre>{JSON.stringify(snapshot.unresolvedLinks, null, 2)}</pre>
		</details>
	{/if}

	<details open>
		<summary>Renderer ({snapshot.renderer.status})</summary>
		<pre>{JSON.stringify(snapshot.renderer, null, 2)}</pre>
	</details>

	<details open>
		<summary>Workspace state and query</summary>
		<pre>{JSON.stringify(snapshot.state, null, 2)}</pre>
	</details>

	<details open>
		<summary
			>Detected relation metadata ({snapshot.metadataSources
				.length})</summary
		>
		<pre>{JSON.stringify(snapshot.metadataSources, null, 2)}</pre>
	</details>

	<details>
		<summary>Canonical nodes ({snapshot.index.nodeCount})</summary>
		<pre>{JSON.stringify(snapshot.index.nodes, null, 2)}</pre>
	</details>

	<details>
		<summary>Canonical edges ({snapshot.index.edgeCount})</summary>
		<pre>{JSON.stringify(snapshot.index.edges, null, 2)}</pre>
	</details>

	<details>
		<summary>Adjacency maps</summary>
		<pre>{JSON.stringify(
				{
					outgoing: snapshot.index.outgoing,
					incoming: snapshot.index.incoming,
				},
				null,
				2,
			)}</pre>
	</details>
</section>
