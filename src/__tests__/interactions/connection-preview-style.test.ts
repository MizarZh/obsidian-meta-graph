import { getActiveChartStyle } from '@/workspace/state/chart-selectors';
import { withChartStyle } from '@/__tests__/fixtures/chart-style';
import { describe, expect, it } from 'vitest';
import type { WorkspaceState } from '@/core/types';
import {
	resolveConnectionPreviewMarkers,
	resolveConnectionPreviewStyle,
} from '@/ui/workspace/connection-preview-style';
import { createWorkspaceState } from '@/workspace/state/workspace-state';

describe('resolveConnectionPreviewStyle', () => {
	it('resolves all visual properties together and preserves legacy rule fallbacks', () => {
		const state = createWorkspaceState(200);
		state.activeConnectionField = ' leads-to ';
		state.defaultLinkStyle = {
			...state.defaultLinkStyle,
			arrowStyle: 'chevron',
			opacity: 0.7,
			arrowSize: 2,
		};
		getActiveChartStyle(state).linkRules = [
			{
				id: 'field',
				field: 'source-field',
				value: 'leads-to',
				color: '#abcdef',
				size: 4,
				lineStyle: 'dotted',
				label: '  ',
				showLabel: true,
				hidden: false,
			},
		];
		expect(resolveConnectionPreviewStyle(state, 'A.md', 'B.md')).toEqual({
			color: '#abcdef',
			size: 4,
			lineStyle: 'dotted',
			label: 'leads-to',
			hidden: false,
			arrowStyle: 'chevron',
			opacity: 0.7,
			arrowSize: 2,
		});
		getActiveChartStyle(state).linkRules.push({
			...getActiveChartStyle(state).linkRules[0]!,
			id: 'last',
			color: '#123456',
			size: 6,
			arrowStyle: 'filled',
			opacity: 0.25,
			arrowSize: 1.5,
			label: ' Next ',
			hidden: true,
		});
		expect(resolveConnectionPreviewStyle(state, 'A.md', 'B.md')).toEqual({
			color: '#123456',
			size: 6,
			lineStyle: 'dotted',
			label: 'Next',
			hidden: true,
			arrowStyle: 'filled',
			opacity: 0.25,
			arrowSize: 1.5,
		});
	});
	it('uses the active link defaults and matching field rules', () => {
		const state: WorkspaceState = withChartStyle(
			{
				...createWorkspaceState(200),
				activeConnectionField: 'leads-to',
				defaultLinkStyle: {
					color: '#111111',
					size: 2,
					lineStyle: 'solid',
					arrowStyle: 'filled',
					opacity: 1,
					arrowSize: 1,
					label: '',
					showLabel: false,
					hidden: false,
				},
			},
			{
				linkRules: [
					{
						id: 'active-field',
						field: 'source-field',
						value: 'leads-to',
						color: '#abcdef',
						size: 4,
						lineStyle: 'dashed',
						label: '',
						showLabel: false,
						hidden: false,
					},
				],
			},
		);

		expect(
			resolveConnectionPreviewStyle(state, 'a.md', 'b.md'),
		).toMatchObject({
			color: '#abcdef',
			size: 4,
			lineStyle: 'dashed',
			hidden: false,
		});
	});
});

describe('resolveConnectionPreviewMarkers', () => {
	it('points one-way connections toward target', () => {
		expect(resolveConnectionPreviewMarkers('directed')).toEqual({
			start: false,
			end: true,
		});
	});

	it('points reverse connections toward source', () => {
		expect(resolveConnectionPreviewMarkers('reverse')).toEqual({
			start: true,
			end: false,
		});
	});

	it('shows arrows at both ends for two-way connections', () => {
		expect(resolveConnectionPreviewMarkers('bidirectional')).toEqual({
			start: true,
			end: true,
		});
	});
});
