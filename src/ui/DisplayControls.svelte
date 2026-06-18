<script lang="ts">
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
		<input
			type="range"
			min="0.25"
			max="4"
			step="0.05"
			value={fadeDistance}
			oninput={(event) => onInput(Number(event.currentTarget.value))}
			onchange={(event) => onCommit(Number(event.currentTarget.value))}
		/>
		<output>{fadeDistance.toFixed(2)}</output>
	</label>
</details>
