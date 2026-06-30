import { describe, expect, it } from 'vitest';
import {
	readInteractiveAccentColor,
	readThemeSignature,
	type ThemeDocumentLike,
} from '../ui/workspace/theme';

function createThemeDocument(
	documentClassName: string,
	bodyClassName: string,
): ThemeDocumentLike {
	return {
		documentElement: { className: documentClassName },
		body: { className: bodyClassName },
	};
}

function createStyleDocument(accentColor: string): Document {
	return {
		body: {},
		defaultView: {
			getComputedStyle: () => ({
				getPropertyValue: (property: string) =>
					property === '--interactive-accent' ? accentColor : '',
			}),
		},
	} as unknown as Document;
}

describe('workspace theme helpers', () => {
	it('builds a stable signature from document and body classes', () => {
		expect(
			readThemeSignature(createThemeDocument('theme-dark', 'is-mobile')),
		).toBe('theme-dark|is-mobile');
	});

	it('reads the interactive accent color from computed styles', () => {
		expect(
			readInteractiveAccentColor(createStyleDocument('  #3366ff  ')),
		).toBe('#3366ff');
	});

	it('uses a fallback when the accent color is empty', () => {
		expect(
			readInteractiveAccentColor(createStyleDocument(''), '#123456'),
		).toBe('#123456');
	});
});
