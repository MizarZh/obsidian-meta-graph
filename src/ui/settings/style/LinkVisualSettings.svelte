<script lang="ts">
	import type {
		DefaultLinkStyle,
		LinkArrowStyle,
		LinkLineStyle,
	} from '../../../core/types';
	import ColorSetting from '../fields/ColorSetting.svelte';
	import SegmentedSetting from '../fields/SegmentedSetting.svelte';
	import SliderSetting from '../fields/SliderSetting.svelte';
	import SettingGrid from '../SettingGrid.svelte';

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
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
		{ value: 'dash-dot', label: 'Dash-dot' },
	] satisfies Array<{ value: LinkLineStyle; label: string }>;

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
				min={0.5}
				max={10}
				step={0.5}
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
