import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			obsidian: fileURLToPath(
				new URL(
					'./src/__tests__/fixtures/obsidian.ts',
					import.meta.url,
				),
			),
		},
	},
});
