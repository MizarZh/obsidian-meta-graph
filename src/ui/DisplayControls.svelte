<script lang="ts">
	import ObsidianSlider from './obsidian/ObsidianSlider.svelte';

	let {
		fadeDistance,
		onInput,
		onCommit,
	}: {
		fadeDistance: number;
		onInput: (value: number) => void;
		onCommit: (value: number) => void;
	} = $props();
</script>

<details class="knowledge-workspace-display-controls">
	<summary>Display</summary>
	<label>
		<span>Fade distance</span>
		<ObsidianSlider
			value={fadeDistance}
			min={0.25}
			max={4}
			step={0.05}
			onChange={onInput}
			{onCommit}
		/>
	</label>
</details>
