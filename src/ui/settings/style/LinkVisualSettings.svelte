<script lang="ts">
	import type {
		DefaultLinkStyle,
		LinkArrowStyle,
		LinkLineStyle,
	} from '@/core/types';
	import ColorSetting from '@/ui/settings/fields/ColorSetting.svelte';
	import SegmentedSetting from '@/ui/settings/fields/SegmentedSetting.svelte';
	import SliderSetting from '@/ui/settings/fields/SliderSetting.svelte';
	import SettingGrid from '@/ui/settings/SettingGrid.svelte';
	import type { SettingOption } from '@/ui/settings/types';

	export type LinkVisualValue = Required<
		Pick<
			DefaultLinkStyle,
			| 'color'
			| 'size'
			| 'opacity'
			| 'lineStyle'
			| 'arrowStyle'
			| 'arrowSize'
		>
	>;

	export const LINK_LINE_STYLE_OPTIONS = [
		{
			value: 'solid',
			label: 'Solid',
			tooltip: 'Solid',
			class: 'knowledge-workspace-pattern-solid',
		},
		{
			value: 'dashed',
			label: 'Dashed',
			tooltip: 'Dashed',
			class: 'knowledge-workspace-pattern-dashed',
		},
		{
			value: 'dotted',
			label: 'Dotted',
			tooltip: 'Dotted',
			class: 'knowledge-workspace-pattern-dotted',
		},
		{
			value: 'dash-dot',
			label: 'Dash-dot',
			tooltip: 'Dash-dot',
			class: 'knowledge-workspace-pattern-dash-dot',
		},
	] satisfies Array<SettingOption<LinkLineStyle>>;

	export const LINK_ARROW_STYLE_OPTIONS = [
		{ value: 'filled', label: 'Filled' },
		{ value: 'chevron', label: 'Chevron' },
	] satisfies Array<{ value: LinkArrowStyle; label: string }>;

	let {
		value,
		commitKey,
		class: className = '',
		onPatch,
	}: {
		value: LinkVisualValue;
		commitKey: string;
		class?: string;
		onPatch: (patch: Partial<LinkVisualValue>) => void;
	} = $props();

	const formatWidth = (nextValue: number): string => nextValue.toFixed(1);
	const formatOpacity = (nextValue: number): string =>
		`${Math.round(nextValue * 100)}%`;
	const formatArrowSize = (nextValue: number): string =>
		`${nextValue.toFixed(2)}×`;
</script>

<div class={`knowledge-workspace-visual-settings ${className}`.trim()}>
	<section class="knowledge-workspace-visual-section">
		<h5>Line</h5>
		<SettingGrid
			class="knowledge-workspace-link-line-grid"
			density="compact"
		>
			<ColorSetting
				label="Color"
				layout="stacked"
				value={value.color}
				commitKey={`${commitKey}:line-color`}
				ariaLabel="Link line color"
				onChange={(color) => onPatch({ color })}
			/>
			<SliderSetting
				label="Width"
				layout="stacked"
				value={value.size}
				min={0.1}
				max={10}
				step={0.1}
				format={formatWidth}
				ariaLabel="Link line width"
				onChange={(size) => onPatch({ size })}
			/>
		</SettingGrid>
		<SliderSetting
			label="Opacity"
			value={value.opacity}
			min={0}
			max={1}
			step={0.01}
			format={formatOpacity}
			ariaLabel="Link line opacity"
			onChange={(opacity) => onPatch({ opacity })}
		/>
		<SegmentedSetting
			label="Pattern"
			class="knowledge-workspace-pattern-options"
			value={value.lineStyle}
			options={LINK_LINE_STYLE_OPTIONS}
			onChange={(lineStyle) => onPatch({ lineStyle })}
		/>
	</section>

	<section class="knowledge-workspace-visual-section">
		<h5>Arrow</h5>
		<SegmentedSetting
			label="Style"
			value={value.arrowStyle}
			options={LINK_ARROW_STYLE_OPTIONS}
			onChange={(arrowStyle) => onPatch({ arrowStyle })}
		/>
		<SliderSetting
			label="Size"
			value={value.arrowSize}
			min={0.25}
			max={3}
			step={0.05}
			format={formatArrowSize}
			ariaLabel="Link arrow size"
			onChange={(arrowSize) => onPatch({ arrowSize })}
		/>
	</section>
</div>
