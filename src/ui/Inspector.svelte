<script lang="ts">
	import type { KnowledgeNode } from '../core/types';

	let { node }: { node?: KnowledgeNode } = $props();
</script>

{#if node}
	<section class="knowledge-workspace-inspector">
		<strong>{node.title}</strong>
		<span>{node.path}</span>
		{#if node.noteType}<span>Type: {node.noteType}</span>{/if}
		{#if node.domains.length}<span>Domains: {node.domains.join(', ')}</span>{/if}
	</section>
{/if}
