<script lang="ts">
	import type { DefaultNodeStyle, NodeShape } from '../../../core/types';
	import ColorSetting from '../fields/ColorSetting.svelte';
	import DropdownSetting from '../fields/DropdownSetting.svelte';
	import SliderSetting from '../fields/SliderSetting.svelte';
	import SettingGrid from '../SettingGrid.svelte';

	export type NodeVisualValue = Required<
		Pick<DefaultNodeStyle, 'color' | 'size' | 'shape'>
	>;

	export const NODE_SHAPE_OPTIONS: Array<{
		value: NodeShape;
		label: string;
	}> = [
		{ value: 'circle', label: 'Circle' },
		{ value: 'square', label: 'Square' },
		{ value: 'diamond', label: 'Diamond' },
		{ value: 'triangle', label: 'Triangle' },
		{ value: 'hexagon', label: 'Hexagon' },
		{ value: 'star', label: 'Star' },
	];

	let {
		value,
		commitKey,
		class: className = '',
		onPatch,
	}: {
		value: NodeVisualValue;
		commitKey: string;
		class?: string;
		onPatch: (patch: Partial<NodeVisualValue>) => void;
	} = $props();
</script>

<div class={`knowledge-workspace-node-visual-settings ${className}`.trim()}>
	<SettingGrid density="compact">
		<ColorSetting
			label="Color"
			layout="stacked"
			value={value.color}
			commitKey={`${commitKey}:color`}
			ariaLabel="Note color"
			onChange={(color) => onPatch({ color })}
		/>
		<DropdownSetting
			label="Shape"
			layout="stacked"
			value={value.shape}
			options={NODE_SHAPE_OPTIONS}
			ariaLabel="Note shape"
			onChange={(shape) => onPatch({ shape: shape as NodeShape })}
		/>
	</SettingGrid>
	<SliderSetting
		label="Size"
		value={value.size}
		min={1}
		max={30}
		step={0.5}
		format={(nextValue) => nextValue.toFixed(1)}
		ariaLabel="Note size"
		onChange={(size) => onPatch({ size })}
	/>
</div>
