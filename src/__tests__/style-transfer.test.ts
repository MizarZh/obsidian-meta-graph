import { describe, expect, it } from 'vitest';
import type { ChartStyleConfig } from '../core/types';
import { copyChartStyles, pasteChartStyles } from '../ui/filter/style-transfer';

function createStyle(): ChartStyleConfig {
	return {
		nodeOverrides: { color: '#123456', size: 8 },
		unresolvedNodeOverrides: { color: '#654321' },
		linkOverrides: { color: '#abcdef', lineStyle: 'dashed' },
		plainLinkOverrides: {},
		unresolvedLinkOverrides: { hidden: true },
		nodeRules: [
			{
				id: 'node-rule',
				field: 'tag',
				operator: 'contains',
				value: '#project',
				color: '#ff0000',
				size: 12,
			},
		],
		linkRules: [
			{
				id: 'link-rule',
				field: 'source-field',
				operator: 'is',
				value: 'leads-to',
				color: '#00ff00',
				size: 2,
				lineStyle: 'solid',
				label: '',
				showLabel: false,
				hidden: false,
			},
		],
	};
}

describe('style transfer', () => {
	it('copies chart styles and regenerates rule ids on paste', async () => {
		const style = createStyle();
		await copyChartStyles(style);
		const pasted = await pasteChartStyles();

		expect(pasted).toBeDefined();
		expect(pasted?.nodeOverrides).toEqual(style.nodeOverrides);
		expect(pasted?.linkOverrides).toEqual(style.linkOverrides);
		expect(pasted?.nodeRules[0]).toMatchObject({
			field: style.nodeRules[0]?.field,
			operator: style.nodeRules[0]?.operator,
			value: style.nodeRules[0]?.value,
			color: style.nodeRules[0]?.color,
			size: style.nodeRules[0]?.size,
		});
		expect(pasted?.nodeRules[0]?.id).not.toBe(style.nodeRules[0]?.id);
		expect(pasted?.linkRules[0]?.id).not.toBe(style.linkRules[0]?.id);
	});
});
