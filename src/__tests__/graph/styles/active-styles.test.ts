import { withChartStyle } from '@/__tests__/fixtures/chart-style';
import { describe, expect, it } from 'vitest';
import {
	getActiveDefaultLinkStyle,
	getActiveDefaultNodeStyle,
	getActiveLinkStyleRules,
	getActiveNodeStyleRules,
} from '@/graph/styles/active-styles';

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
			getActiveNodeStyleRules(
				withChartStyle(
					{ globalNodeStyleRules: [globalNodeRule] },
					{ nodeRules: [nodeRule] },
				),
			),
		).toEqual([globalNodeRule, nodeRule]);
		expect(
			getActiveLinkStyleRules(
				withChartStyle(
					{ globalLinkStyleRules: [globalLinkRule] },
					{ linkRules: [linkRule] },
				),
			),
		).toEqual([globalLinkRule, linkRule]);
	});

	it('applies overrides before defaults and fallback colors', () => {
		expect(
			getActiveDefaultNodeStyle(
				withChartStyle(
					{
						defaultNodeStyle: {
							color: '#default',
							size: 6,
							opacity: 1,
							shape: 'circle',
						},
					},
					{ nodeOverrides: { color: '#override' } },
				),
				'#fallback',
			),
		).toEqual({ color: '#override', size: 6, opacity: 1, shape: 'circle' });

		expect(
			getActiveDefaultLinkStyle(
				withChartStyle(
					{
						defaultLinkStyle: {
							color: '#default',
							size: 1,
							lineStyle: 'solid',
							arrowStyle: 'filled',
							opacity: 1,
							arrowSize: 1,
							label: '',
							showLabel: false,
							hidden: false,
						},
					},
					{ linkOverrides: { size: 3, hidden: true } },
				),
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
