import { withAlpha, type GraphPalette } from '../styles/graph-styles';

export interface LabelThemeConfig {
	labelLightTextColor: string;
	labelLightBackgroundColor: string;
	labelLightBackgroundOpacity: number;
	labelDarkTextColor: string;
	labelDarkBackgroundColor: string;
	labelDarkBackgroundOpacity: number;
}

export interface ResolvedLabelStyle {
	textColor: string;
	backgroundColor: string;
}

export function resolveThreeLabelStyle(
	palette: GraphPalette,
	theme: LabelThemeConfig,
): ResolvedLabelStyle {
	const lightBackground = isLightColor(palette.background ?? '#202020');
	return lightBackground
		? {
				textColor: theme.labelLightTextColor,
				backgroundColor:
					theme.labelLightBackgroundOpacity <= 0
						? 'transparent'
						: withAlpha(
								theme.labelLightBackgroundColor,
								theme.labelLightBackgroundOpacity,
							),
			}
		: {
				textColor: theme.labelDarkTextColor,
				backgroundColor:
					theme.labelDarkBackgroundOpacity <= 0
						? 'transparent'
						: withAlpha(
								theme.labelDarkBackgroundColor,
								theme.labelDarkBackgroundOpacity,
							),
			};
}

function isLightColor(color: string): boolean {
	const channels = color.match(/[\d.]+/gu);
	if (!channels || channels.length < 3) {
		return false;
	}
	const [r, g, b] = channels.slice(0, 3).map((value) => {
		const channel = Number(value) / 255;
		return channel <= 0.03928
			? channel / 12.92
			: ((channel + 0.055) / 1.055) ** 2.4;
	});
	const luminance = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
	return luminance > 0.55;
}
