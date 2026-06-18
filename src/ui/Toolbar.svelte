<script lang="ts">
	import type { ViewMode } from '../core/types';

	let {
		mode,
		onMode,
		onCurrentNote,
		onFit,
		onRefresh,
	}: {
		mode: ViewMode;
		onMode: (mode: ViewMode) => void;
		onCurrentNote: () => void;
		onFit: () => void;
		onRefresh: () => void;
	} = $props();
</script>

<div class="knowledge-workspace-toolbar">
	<div class="knowledge-workspace-segmented" aria-label="Layout mode">
		<button class:active={mode === 'graph'} onclick={() => onMode('graph')}>Graph</button>
		<button class:active={mode === 'flow'} onclick={() => onMode('flow')}>Flow</button>
	</div>
	<button onclick={onCurrentNote}>Current note</button>
	<button onclick={onFit}>Fit graph</button>
	<button onclick={onRefresh}>Refresh</button>
</div>
