import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, parse as parsePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArchilang } from './parser.js';
import { resolve as resolveModel } from './resolver.js';
import { validateBuilding, formatValidation } from './validator.js';
import { composeSvg } from './svg-composer.js';
import { escapeXml } from './svg-utils.js';
import { computeAreaSummary, areaSummaryToJson } from './area-table.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'validate') {
    runValidate(args.slice(1));
  } else {
    runRender(args);
  }
}

// ─── render (default) ───

function runRender(args: string[]) {
  const areaTable = args.includes('--area-table');
  const filteredArgs = args.filter(a => a !== '--area-table');

  const inputPath = filteredArgs[0] || resolve(__dirname, '..', 'samples', 'basic-3room.yaml');
  const outputPath = filteredArgs[1] || resolve(__dirname, '..', 'output.svg');

  console.log(`Reading: ${inputPath}`);
  const yamlText = readFileSync(inputPath, 'utf-8');

  const spec = parseArchilang(yamlText);
  console.log(`ARCHILANG v${spec.archilang} — ${spec.building.structure}`);
  console.log(`Rooms: ${spec.geometry.rooms.length}, Openings: ${spec.geometry.openings.length}`);

  const model = resolveModel(spec);
  console.log(`Grid: ${model.totalGridX}×${model.totalGridY} (${model.moduleSize}mm module)`);
  console.log(`Walls: ${model.walls.length} (ext: ${model.walls.filter(w => w.isExternal).length}, int: ${model.walls.filter(w => !w.isExternal).length})`);
  console.log(`Resolved openings: ${model.openings.length}`);

  // Validate connectivity
  const validation = validateBuilding(model);
  console.log(formatValidation(validation));

  const svg = composeSvg(model);
  writeFileSync(outputPath, svg, 'utf-8');
  console.log(`SVG written: ${outputPath}`);

  // Also generate HTML preview
  const parsed = parsePath(outputPath);
  const htmlPath = resolve(parsed.dir, `${parsed.name}.html`);
  const html = generateHtmlPreview(svg, spec.archilang);
  writeFileSync(htmlPath, html, 'utf-8');
  console.log(`HTML preview: ${htmlPath}`);

  // Area table JSON (--area-table flag)
  if (areaTable) {
    const summary = computeAreaSummary(model);
    const jsonPath = resolve(parsed.dir, `${parsed.name}.area.json`);
    writeFileSync(jsonPath, JSON.stringify(areaSummaryToJson(summary), null, 2), 'utf-8');
    console.log(`Area table JSON: ${jsonPath}`);
  }
}

// ─── validate ───

function runValidate(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: main.js validate <file.yaml> [file2.yaml ...]');
    console.log('       main.js validate --all');
    process.exit(0);
  }
  if (args.length === 0) {
    console.error('Usage: main.js validate <file.yaml> [file2.yaml ...]');
    console.error('       main.js validate --all');
    process.exit(1);
  }

  const files = args.includes('--all')
    ? findSampleFiles()
    : args.map(f => resolve(f));

  let hasError = false;

  for (const filePath of files) {
    const label = filePath.replace(process.cwd() + '/', '');
    let yamlText: string;
    try {
      yamlText = readFileSync(filePath, 'utf-8');
    } catch {
      console.error(`✗ ${label}: file not found`);
      hasError = true;
      continue;
    }

    try {
      const spec = parseArchilang(yamlText);
      const model = resolveModel(spec);
      const result = validateBuilding(model);

      if (!result.ok) hasError = true;
      console.log(`${result.ok ? '✓' : '✗'} ${label}`);
      for (const issue of result.issues) {
        const prefix = issue.severity === 'error' ? '  ERROR' : '  WARN ';
        console.log(`${prefix} [${issue.code}] ${issue.message}`);
      }
    } catch (e) {
      hasError = true;
      console.error(`✗ ${label}: ${e instanceof Error ? e.message : e}`);
    }
  }

  process.exit(hasError ? 1 : 0);
}

function findSampleFiles(): string[] {
  const samplesDir = resolve(__dirname, '..', 'samples');
  return readdirSync(samplesDir)
    .filter(f => f.endsWith('.yaml'))
    .sort()
    .map(f => resolve(samplesDir, f));
}

// ─── helpers ───

function generateHtmlPreview(svgContent: string, version: string): string {
  const inlineSvg = svgContent.replace(/<\?xml[^?]*\?>\n?/, '');
  const safeVersion = escapeXml(version);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ARCHILANG v${safeVersion} — Floor Plan Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
    }
    h1 {
      font-size: 18px;
      color: #333;
      margin-bottom: 16px;
    }
    .svg-container {
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: auto;
    }
    svg { display: block; }
  </style>
</head>
<body>
  <h1>ARCHILANG v${safeVersion} — 1F Floor Plan</h1>
  <div class="svg-container">
    ${inlineSvg}
  </div>
</body>
</html>`;
}

main();
