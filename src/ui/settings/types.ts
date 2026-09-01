export type SettingLayout = 'row' | 'stacked' | 'segmented';

export type SettingGridDensity = 'comfortable' | 'compact';

export interface SettingOption<T extends string | number> {
	value: T;
	label: string;
}

export type NumericSettingFormatter = (value: number) => string;
