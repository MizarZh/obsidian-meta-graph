import { describe, expect, it } from 'vitest';
import { shouldCloseSettingsPanelForChartSource } from '../ui/workspace/settings-panel';

describe('workspace settings panel visibility', () => {
	it('closes panels that do not apply to the new chart source', () => {
		expect(shouldCloseSettingsPanelForChartSource('filters', 'curated')).toBe(
			true,
		);
		expect(shouldCloseSettingsPanelForChartSource('workspace', 'query')).toBe(
			true,
		);
	});

	it('keeps panels that still apply', () => {
		expect(shouldCloseSettingsPanelForChartSource('filters', 'query')).toBe(
			false,
		);
		expect(shouldCloseSettingsPanelForChartSource('workspace', 'curated')).toBe(
			false,
		);
		expect(shouldCloseSettingsPanelForChartSource(undefined, 'query')).toBe(
			false,
		);
	});
});
