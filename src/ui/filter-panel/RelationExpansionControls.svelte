<script lang="ts">
	import type { DirectionMode } from '@/core/types';
	import ObsidianDropdown from '@/ui/obsidian/ObsidianDropdown.svelte';
	import ObsidianSlider from '@/ui/obsidian/ObsidianSlider.svelte';

	let {
		scope,
		direction,
		depth,
		onChange,
	}: {
		scope: string;
		direction: DirectionMode;
		depth: number;
		onChange: (patch: {
			direction?: DirectionMode;
			depth?: number;
		}) => void;
	} = $props();
</script>

<div class="knowledge-workspace-expansion-controls">
	<ObsidianDropdown
		value={direction}
		ariaLabel={`${scope}: Direction`}
		options={[
			{ value: 'both', label: 'Both ↔' },
			{ value: 'outgoing', label: 'Outgoing →' },
			{ value: 'incoming', label: 'Incoming ←' },
		]}
		onChange={(value) => onChange({ direction: value as DirectionMode })}
	/>
	<div class="knowledge-workspace-expansion-depth">
		<span>Layers</span>
		<ObsidianSlider
			value={depth}
			min={1}
			max={3}
			step={1}
			ariaLabel={`${scope}: Layers`}
			onChange={(depth) => onChange({ depth })}
		/>
		<span class="knowledge-workspace-expansion-depth-value">{depth}</span>
	</div>
</div>
