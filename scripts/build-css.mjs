import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const entry = path.join(root, 'src/styles/index.css');
const output = path.join(root, 'styles.css');
const watch = process.argv.includes('--watch');

const importPattern = /^\s*@import\s+["'](.+)["'];\s*(?:\r?\n)?$/u;

async function buildCss() {
	const seen = new Set();
	const css = await inlineImports(entry, seen);
	await fs.writeFile(output, `${css.trimEnd()}\n`, 'utf8');
	console.log(`styles.css built from src/styles/index.css`);
}

async function inlineImports(filePath, seen) {
	const normalizedPath = path.normalize(filePath);
	if (seen.has(normalizedPath)) {
		throw new Error(`CSS import cycle detected: ${normalizedPath}`);
	}
	seen.add(normalizedPath);

	const source = await fs.readFile(normalizedPath, 'utf8');
	const chunks = [];
	for (const line of source.match(/^.*(?:\r?\n|$)/gmu) ?? []) {
		if (!line) {
			continue;
		}
		const match = importPattern.exec(line);
		if (!match) {
			chunks.push(line);
			continue;
		}
		const importPath = match[1];
		if (!importPath.endsWith('.css')) {
			throw new Error(`Only .css imports are supported: ${importPath}`);
		}
		const childPath = path.resolve(
			path.dirname(normalizedPath),
			importPath,
		);
		chunks.push(await inlineImports(childPath, seen));
	}
	seen.delete(normalizedPath);
	return chunks.join('');
}

await buildCss();

if (watch) {
	const stylesDir = path.join(root, 'src/styles');
	let rebuildTimer;
	const scheduleBuild = () => {
		if (rebuildTimer) {
			clearTimeout(rebuildTimer);
		}
		rebuildTimer = setTimeout(() => {
			rebuildTimer = undefined;
			buildCss().catch((error) => {
				console.error(error);
			});
		}, 50);
	};

	const watcher = (await import('node:fs')).watch(
		stylesDir,
		{ recursive: true },
		scheduleBuild,
	);
	process.on('SIGINT', () => {
		watcher.close();
		process.exit(0);
	});
}
