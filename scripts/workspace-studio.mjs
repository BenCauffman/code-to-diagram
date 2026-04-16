#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

const sourceFile = process.argv[2];
const outputFile = process.argv[3];
const workspaceDir = process.argv[4];

if (!sourceFile || !outputFile || !workspaceDir) {
  console.error('workspace-studio: usage: workspace-studio <source> <output> <workspaceDir>');
  process.exit(1);
}

const absoluteSource = path.resolve(sourceFile);
const absoluteOutput = path.resolve(outputFile);
const absoluteWorkspace = path.resolve(workspaceDir);
const sourceContent = await readText(absoluteSource);
const sourceRelative = path.relative(absoluteWorkspace, absoluteSource) || path.basename(absoluteSource);
const outputRelative = path.relative(absoluteWorkspace, absoluteOutput) || path.basename(absoluteOutput);
const studioFile = path.join(absoluteWorkspace, 'workspace-studio.html');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="2" />
    <title>Workspace Studio</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b1020;
        --panel: #11182d;
        --panel-2: #0e1528;
        --border: #28314d;
        --text: #e6ebff;
        --muted: #97a2c7;
        --accent: #8fd3ff;
        --shadow: rgba(0, 0, 0, 0.35);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(143, 211, 255, 0.12), transparent 24%),
          radial-gradient(circle at bottom right, rgba(135, 123, 255, 0.10), transparent 28%),
          var(--bg);
        color: var(--text);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      header {
        padding: 16px 20px 0;
      }
      .title {
        font-size: 12px;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 10px;
        color: var(--muted);
        font-size: 12px;
      }
      .meta span {
        padding: 4px 10px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.03);
      }
      main {
        display: grid;
        grid-template-columns: minmax(320px, 1.1fr) minmax(320px, 0.9fr);
        gap: 16px;
        padding: 16px 20px 20px;
        min-height: calc(100vh - 72px);
      }
      section {
        border: 1px solid var(--border);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 22%), var(--panel);
        box-shadow: 0 16px 40px var(--shadow);
        overflow: hidden;
      }
      .pane-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
        background: rgba(255,255,255,0.02);
      }
      .pane-header h2 {
        margin: 0;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .pane-header small {
        color: var(--muted);
      }
      pre {
        margin: 0;
        padding: 16px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.55;
      }
      code {
        color: var(--text);
      }
      .image-wrap {
        display: grid;
        place-items: center;
        min-height: 100%;
        padding: 16px;
        background: var(--panel-2);
      }
      img {
        max-width: 100%;
        height: auto;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 14px 36px rgba(0,0,0,0.35);
        background: #fff;
      }
      .empty {
        color: var(--muted);
      }
      @media (max-width: 960px) {
        main { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="title">Workspace Studio</div>
      <div class="meta">
        <span>Source: ${escapeHtml(sourceRelative)}</span>
        <span>Preview: ${escapeHtml(outputRelative)}</span>
        <span>Auto-refresh: 2s</span>
      </div>
    </header>
    <main>
      <section>
        <div class="pane-header">
          <h2>Source</h2>
          <small>${escapeHtml(path.basename(sourceRelative))}</small>
        </div>
        ${sourceContent
          ? `<pre><code>${escapeHtml(sourceContent)}</code></pre>`
          : '<div class="empty" style="padding: 16px;">Source file is empty.</div>'}
      </section>
      <section>
        <div class="pane-header">
          <h2>Preview</h2>
          <small>${escapeHtml(path.basename(outputRelative))}</small>
        </div>
        <div class="image-wrap">
          <img src="${escapeHtml(outputRelative)}" alt="Rendered diagram preview" />
        </div>
      </section>
    </main>
  </body>
</html>
`;

await fs.writeFile(studioFile, html, 'utf8');
console.log(studioFile);
