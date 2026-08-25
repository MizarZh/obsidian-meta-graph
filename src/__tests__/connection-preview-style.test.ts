import { describe, expect, it } from 'vitest';
import type { WorkspaceState } from '../core/types';
import {
	resolveConnectionPreviewMarkers,
	resolveConnectionPreviewStyle,
} from '../ui/workspace/connection-preview-style';
import { createWorkspaceState } from '../workspace/state/workspace-state';

describe('resolveConnectionPreviewStyle', () => {
	it('uses the active link defaults and matching field rules', () => {
		const state: WorkspaceState = {
			...createWorkspaceState(200),
			activeConnectionField: 'leads-to',
			defaultLinkStyle: {
				color: '#111111',
				size: 2,
				lineStyle: 'solid',
				label: '',
				showLabel: false,
				hidden: false,
			},
			linkStyleRules: [
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
		};

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
