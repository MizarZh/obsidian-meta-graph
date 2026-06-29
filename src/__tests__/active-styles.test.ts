import { describe, expect, it } from 'vitest';
import {
	getActiveDefaultLinkStyle,
	getActiveDefaultNodeStyle,
	getActiveLinkStyleRules,
	getActiveNodeStyleRules,
} from '../graph/active-styles';

describe('active style composition', () => {
	it('combines global and chart-specific rules in application order', () => {
		const globalNodeRule = {
			id: 'global-node',
			field: 'all' as const,
			value: '',
			color: '#111111',
			size: 7,
		};
		const nodeRule = {
			id: 'node',
			field: 'tag' as const,
			value: 'x',
			color: '#222222',
			size: 8,
		};
		const globalLinkRule = {
			id: 'global-link',
			field: 'all' as const,
			value: '',
			color: '#333333',
			size: 1,
			lineStyle: 'solid' as const,
			label: '',
			showLabel: false,
			hidden: false,
		};
		const linkRule = {
			...globalLinkRule,
			id: 'link',
			field: 'relation' as const,
			value: 'related',
		};

		expect(
			getActiveNodeStyleRules({
				globalNodeStyleRules: [globalNodeRule],
				nodeStyleRules: [nodeRule],
			}),
		).toEqual([globalNodeRule, nodeRule]);
		expect(
			getActiveLinkStyleRules({
				globalLinkStyleRules: [globalLinkRule],
				linkStyleRules: [linkRule],
			}),
		).toEqual([globalLinkRule, linkRule]);
	});

	it('applies overrides before defaults and fallback colors', () => {
		expect(
			getActiveDefaultNodeStyle(
				{
					nodeStyleOverrides: { color: '#override' },
					defaultNodeStyle: { color: '#default', size: 6 },
				},
				'#fallback',
			),
		).toEqual({ color: '#override', size: 6 });

		expect(
			getActiveDefaultLinkStyle(
				{
					linkStyleOverrides: { size: 3, hidden: true },
					defaultLinkStyle: {
						color: '#default',
						size: 1,
						lineStyle: 'solid',
						label: '',
						showLabel: false,
						hidden: false,
					},
				},
				'#fallback',
			),
		).toEqual({
			color: '#default',
			size: 3,
			lineStyle: 'solid',
			label: '',
			showLabel: false,
			hidden: true,
		});
	});
});
