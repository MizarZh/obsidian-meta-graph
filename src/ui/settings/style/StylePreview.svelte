<script lang="ts">
	import type { LinkLineStyle, NodeShape } from '@/core/types';
	let {
		color,
		nodeShape = 'circle',
		linePreview,
	}: {
		color: string;
		nodeShape?: NodeShape;
		linePreview?: {
			lineStyle: LinkLineStyle;
			size: number;
			opacity?: number;
		};
	} = $props();
</script>

{#if linePreview}
	<svg
		class="knowledge-workspace-style-rule-line-preview"
		width="40"
		height="16"
		viewBox="0 0 40 16"
		aria-hidden="true"
	>
		<line
			x1="2"
			y1="8"
			x2="38"
			y2="8"
			stroke={color}
			stroke-width={linePreview.size}
			opacity={linePreview.opacity ?? 1}
			stroke-linecap={linePreview.lineStyle === 'dotted'
				? 'round'
				: 'butt'}
			stroke-dasharray={linePreview.lineStyle === 'dashed'
				? '7 4'
				: linePreview.lineStyle === 'dotted'
					? '0 6'
					: linePreview.lineStyle === 'dash-dot'
						? '7 4 2 4'
						: undefined}
		/>
	</svg>
{:else}
	<svg
		class="knowledge-workspace-style-rule-swatch"
		width="16"
		height="16"
		viewBox="0 0 20 20"
		fill={color}
		aria-hidden="true"
	>
		{#if nodeShape === 'square'}
			<rect x="2" y="2" width="16" height="16" />
		{:else if nodeShape === 'diamond'}
			<polygon points="10,0 20,10 10,20 0,10" />
		{:else if nodeShape === 'triangle'}
			<polygon points="10,1 19,18 1,18" />
		{:else if nodeShape === 'hexagon'}
			<polygon points="5,1.34 15,1.34 20,10 15,18.66 5,18.66 0,10" />
		{:else if nodeShape === 'star'}
			<polygon
				points="10,0 12.35,6.76 19.51,6.91 13.8,11.24 15.88,18.09 10,14 4.12,18.09 6.2,11.24 0.49,6.91 7.65,6.76"
			/>
		{:else}
			<circle cx="10" cy="10" r="8" />
		{/if}
	</svg>
{/if}
