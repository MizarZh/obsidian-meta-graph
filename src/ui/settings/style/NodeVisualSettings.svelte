<script lang="ts">
	import type { DefaultNodeStyle, NodeShape } from '../../../core/types';
	import ColorSetting from '../fields/ColorSetting.svelte';
	import SegmentedSetting from '../fields/SegmentedSetting.svelte';
	import SliderSetting from '../fields/SliderSetting.svelte';
	import SettingGrid from '../SettingGrid.svelte';
	import type { SettingOption } from '../types';

	export type NodeVisualValue = Required<
		Pick<DefaultNodeStyle, 'color' | 'size' | 'opacity' | 'shape'>
	>;

	export const NODE_SHAPE_OPTIONS: Array<SettingOption<NodeShape>> = [
		{ value: 'circle', label: 'Circle', icon: 'circle', tooltip: 'Circle' },
		{ value: 'square', label: 'Square', icon: 'square', tooltip: 'Square' },
		{
			value: 'diamond',
			label: 'Diamond',
			icon: 'diamond',
			tooltip: 'Diamond',
		},
		{
			value: 'triangle',
			label: 'Triangle',
			icon: 'triangle',
			tooltip: 'Triangle',
		},
		{
			value: 'hexagon',
			label: 'Hexagon',
			icon: 'hexagon',
			tooltip: 'Hexagon',
		},
		{ value: 'star', label: 'Star', icon: 'star', tooltip: 'Star' },
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
		<SliderSetting
			label="Size"
			layout="stacked"
			value={value.size}
			min={1}
			max={30}
			step={0.5}
			format={(nextValue) => nextValue.toFixed(1)}
			ariaLabel="Note size"
			onChange={(size) => onPatch({ size })}
		/>
		<SegmentedSetting
			label="Shape"
			value={value.shape}
			options={NODE_SHAPE_OPTIONS}
			rowClass="knowledge-workspace-node-shape-setting"
			onChange={(shape) => onPatch({ shape: shape as NodeShape })}
		/>
	</SettingGrid>
	<SliderSetting
		label="Opacity"
		value={value.opacity}
		min={0}
		max={1}
		step={0.01}
		format={(nextValue) => `${Math.round(nextValue * 100)}%`}
		ariaLabel="Note opacity"
		onChange={(opacity) => onPatch({ opacity })}
	/>
</div>
