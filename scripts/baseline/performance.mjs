import { build } from 'esbuild';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// eslint-disable-next-line no-restricted-imports -- Node tooling does not resolve the source-only @ alias.
import { environment } from './environment.mjs';

const directory = await mkdtemp(join(tmpdir(), 'meta-graph-baseline-'));
try {
	const outfile = join(directory, 'pipeline.mjs');
	await build({
		entryPoints: ['src/__benchmarks__/pipeline.ts'],
		outfile,
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node22',
		alias: { '@': resolve('src') },
	});
	const { runBaseline } = await import(pathToFileURL(outfile).href);
	const report = { schema: 1, environment: environment(), ...runBaseline() };
	await mkdir('reports/baseline', { recursive: true });
	await writeFile(
		'reports/baseline/performance.json',
		JSON.stringify(report, null, 2) + '\n',
	);
	console.table(report.results);
} finally {
	await rm(directory, { recursive: true, force: true });
}
