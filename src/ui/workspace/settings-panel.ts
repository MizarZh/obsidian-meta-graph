import type { ChartSource, SettingsPanelMode } from '../../core/types';

export function shouldCloseSettingsPanelForChartSource(
	panel: SettingsPanelMode | undefined,
	chartSource: ChartSource,
): boolean {
	return (
		(chartSource === 'curated' && panel === 'filters') ||
		(chartSource === 'query' && panel === 'workspace')
	);
}
