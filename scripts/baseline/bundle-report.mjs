import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
// eslint-disable-next-line no-restricted-imports -- Node tooling does not resolve the source-only @ alias.
import { environment } from './environment.mjs';

export async function writeBundleReport(result) {
	const output = result.outputFiles.find((file) =>
		file.path.endsWith('/main.js'),
	);
	if (!output) throw new Error('Expected main.js analysis output.');
	const contributions = Object.values(result.metafile.outputs).flatMap(
		(item) => Object.entries(item.inputs),
	);
	const packages = new Map();
	for (const [path, { bytesInOutput }] of contributions) {
		const tail = path.split('node_modules/').at(-1);
		const name = path.includes('node_modules/')
			? tail
					.split('/')
					.slice(0, tail.startsWith('@') ? 2 : 1)
					.join('/')
			: '(project)';
		const entry = packages.get(name) ?? {
			name,
			bytes: 0,
			roots: new Set(),
		};
		entry.bytes += bytesInOutput;
		if (name !== '(project)')
			entry.roots.add(
				path.slice(0, path.lastIndexOf('node_modules/') + 13) + name,
			);
		packages.set(name, entry);
	}
	const ranked = [...packages.values()]
		.map((item) => ({ ...item, roots: [...item.roots] }))
		.sort((a, b) => b.bytes - a.bytes);
	const report = {
		schema: 1,
		environment: environment(),
		build: {
			format: 'cjs',
			target: 'es2021',
			minify: true,
			sourcemap: false,
		},
		bytes: output.contents.length,
		gzipBytes: gzipSync(output.contents, { level: 9 }).length,
		unattributedBytes:
			output.contents.length -
			ranked.reduce((sum, item) => sum + item.bytes, 0),
		packages: ranked,
		multiplePackageRoots: ranked.filter((item) => item.roots.length > 1),
		topInputs: contributions
			.map(([path, value]) => ({ path, bytes: value.bytesInOutput }))
			.sort((a, b) => b.bytes - a.bytes)
			.slice(0, 30),
	};
	await mkdir('reports/baseline', { recursive: true });
	await writeFile(
		'reports/baseline/bundle.json',
		JSON.stringify(report, null, 2) + '\n',
	);
	await writeFile(
		'reports/baseline/metafile.json',
		JSON.stringify(result.metafile, null, 2) + '\n',
	);
	console.log(
		`Bundle: ${report.bytes} bytes; gzip: ${report.gzipBytes} bytes`,
	);
	console.table(
		ranked.slice(0, 12).map(({ name, bytes }) => ({ name, bytes })),
	);
}
