import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.mts',
						'vitest.config.mts',
						'manifest.json',
					],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['./*', '../*'],
							message: 'Use the @/ alias for project imports.',
						},
					],
				},
			],
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['**/*.mjs'],
		rules: Object.fromEntries(
			Object.keys(obsidianmd.rules).map((ruleName) => [
				`obsidianmd/${ruleName}`,
				'off',
			]),
		),
	},
);
