<script lang="ts">
	let {
		visible,
		label,
	}: {
		visible: boolean;
		label: string;
	} = $props();
</script>

{#if visible}
	<div
		class="knowledge-workspace-graph-loading"
		role="status"
		aria-live="polite"
	>
		<div class="knowledge-workspace-graph-loading-status">
			<span
				class="knowledge-workspace-graph-loading-spinner"
				aria-hidden="true"
			></span>
			<span>Loading {label}</span>
		</div>
	</div>
{/if}
