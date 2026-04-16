#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  addWorkspaceConnection,
  clearWorkspace,
  createWorkspaceNode,
  describeWorkspaceSnapshot,
  readRegistry,
  readWorkspaceGraph,
  readWorkspaceSnapshot,
  readWorkspaceSummaries,
  renderWorkspacePreview,
  setWorkspaceZoomLevel,
} from './workspace-core.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function writeText(filePath, content) {
  await fs.writeFile(filePath, content, 'utf8');
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const attempts = [];
  if (process.platform === 'darwin') {
    attempts.push(['open', url]);
  } else if (process.platform === 'linux') {
    attempts.push(['xdg-open', url]);
    attempts.push(['gio', 'open', url]);
  }

  for (const command of attempts) {
    const result = spawnSync(command[0], command.slice(1), {
      stdio: 'ignore',
    });
    if (!result.error && result.status === 0) {
      return true;
    }
  }

  return false;
}

function workspacePreviewPath(workspaceDir) {
  return path.join(workspaceDir, 'diagram.png');
}

async function resolveInitialWorkspace(initialWorkspaceDir) {
  if (initialWorkspaceDir && await pathExists(initialWorkspaceDir)) {
    return path.resolve(initialWorkspaceDir);
  }

  const registered = await readRegistry();
  if (registered.length > 0) {
    return registered[0];
  }

  return path.resolve(process.cwd());
}

async function getWorkspaceSourceContent(workspaceDir) {
  const snapshot = await readWorkspaceSnapshot(workspaceDir);
  const content = await readText(snapshot.sourceFile);
  const details = describeWorkspaceSnapshot(snapshot);
  return { snapshot, content, details };
}

async function ensureWorkspacePreview(workspaceDir) {
  const outputFile = workspacePreviewPath(workspaceDir);
  if (!(await pathExists(outputFile))) {
    try {
      await renderWorkspacePreview(workspaceDir);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  return null;
}

async function buildState(selectedWorkspaceDir) {
  const workspaces = await readWorkspaceSummaries();
  const selectedDir = selectedWorkspaceDir ? path.resolve(selectedWorkspaceDir) : null;
  let selectedWorkspace = workspaces.find((workspace) => path.resolve(workspace.workspaceDir) === selectedDir) ?? workspaces[0] ?? null;

  if (selectedDir && !workspaces.some((workspace) => path.resolve(workspace.workspaceDir) === selectedDir)) {
    try {
      const snapshot = await readWorkspaceSnapshot(selectedDir);
      const details = describeWorkspaceSnapshot(snapshot);
      selectedWorkspace = {
        workspaceDir: selectedDir,
        sourceFile: snapshot.sourceFile,
        sourceKind: snapshot.sourceKind,
        ...details,
      };
      workspaces.unshift(selectedWorkspace);
    } catch {
      // Ignore and fall back to the registry-based list below.
    }
  }

  if (!selectedWorkspace) {
    return {
      selectedWorkspaceDir: null,
      selectedWorkspace: null,
      workspaces: [],
      edges: [],
      sourceContent: '',
      previewUrl: '',
      previewError: 'No initialized workspaces found.',
    };
  }

  const { snapshot, content, details } = await getWorkspaceSourceContent(selectedWorkspace.workspaceDir);
  const graph = await readWorkspaceGraph();
  const previewError = await ensureWorkspacePreview(selectedWorkspace.workspaceDir);
  const previewFile = workspacePreviewPath(selectedWorkspace.workspaceDir);
  const previewStat = await fs.stat(previewFile).catch(() => null);

  return {
    selectedWorkspaceDir: selectedWorkspace.workspaceDir,
    selectedWorkspace: {
      ...selectedWorkspace,
      ...details,
      sourceFile: snapshot.sourceFile,
    },
    workspaces,
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    sourceContent: content,
    previewUrl: `/preview.png?workspace=${encodeURIComponent(selectedWorkspace.workspaceDir)}&v=${previewStat?.mtimeMs ?? Date.now()}`,
    previewError,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(text);
}

function studioHtml(initialWorkspaceDir) {
  const initialWorkspace = escapeJson(initialWorkspaceDir);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Workspace Studio</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #090d18;
        --panel: #11172a;
        --panel-2: #0d1425;
        --border: #27314a;
        --text: #e7ebff;
        --muted: #9aa5c7;
        --accent: #8fd3ff;
        --good: #7be0a4;
        --bad: #ff8d8d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(143, 211, 255, 0.12), transparent 24%),
          radial-gradient(circle at bottom right, rgba(123, 224, 164, 0.08), transparent 30%),
          var(--bg);
        color: var(--text);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 20px 12px;
      }
      .title {
        font-size: 12px;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .status {
        color: var(--muted);
        font-size: 12px;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(340px, 1.2fr) minmax(340px, 1fr) minmax(320px, 0.9fr);
        gap: 16px;
        padding: 0 20px 20px;
        min-height: calc(100vh - 60px);
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 20%), var(--panel);
        box-shadow: 0 18px 42px rgba(0,0,0,0.35);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .panel h2 {
        margin: 0;
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .panel-head {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        background: rgba(255,255,255,0.02);
      }
      .panel-body {
        padding: 16px;
        overflow: auto;
        min-height: 0;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .layer-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .layer-button.active {
        border-color: var(--good);
        background: linear-gradient(180deg, rgba(123, 224, 164, 0.22), rgba(123, 224, 164, 0.08));
      }
      .zoombar {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .zoom-state {
        min-width: 110px;
        color: var(--muted);
        font-size: 12px;
      }
      select, input, textarea, button {
        font: inherit;
      }
      select, input, textarea {
        width: 100%;
        background: #0b1222;
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
      }
      textarea {
        min-height: 420px;
        resize: vertical;
        line-height: 1.45;
        white-space: pre;
      }
      button {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(143, 211, 255, 0.16), rgba(143, 211, 255, 0.05));
        color: var(--text);
        padding: 10px 14px;
        cursor: pointer;
      }
      button:hover { border-color: var(--accent); }
      .grid {
        display: grid;
        gap: 12px;
      }
      .graph-wrap {
        border: 1px solid var(--border);
        border-radius: 16px;
        background: radial-gradient(circle at center, rgba(143, 211, 255, 0.08), transparent 55%), var(--panel-2);
        min-height: 280px;
        overflow: hidden;
      }
      .graph-wrap svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      .graph-node {
        cursor: pointer;
        transition: transform 120ms ease, filter 120ms ease;
      }
      .graph-node:hover {
        filter: brightness(1.08);
      }
      .graph-node.active rect {
        stroke: var(--good);
        stroke-width: 2.2;
      }
      .graph-link {
        stroke: rgba(159, 172, 216, 0.55);
        stroke-width: 2;
      }
      .graph-link.active {
        stroke: var(--accent);
        stroke-width: 2.6;
      }
      .graph-label {
        fill: var(--text);
        font-size: 12px;
        font-weight: 700;
        text-anchor: middle;
        pointer-events: none;
      }
      .graph-sub {
        fill: var(--muted);
        font-size: 10px;
        text-anchor: middle;
        pointer-events: none;
      }
      .card {
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--panel-2);
        padding: 12px;
        cursor: pointer;
      }
      .card.active {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px rgba(143, 211, 255, 0.2) inset;
      }
      .card-title {
        font-weight: 700;
      }
      .card-sub {
        color: var(--muted);
        font-size: 12px;
        margin-top: 6px;
        word-break: break-word;
      }
      .section {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
      }
      .preview-wrap {
        display: grid;
        place-items: center;
        min-height: 320px;
        background: var(--panel-2);
        border-radius: 14px;
        border: 1px solid var(--border);
        padding: 16px;
      }
      .preview-wrap img {
        max-width: 100%;
        height: auto;
        border-radius: 10px;
        background: white;
        box-shadow: 0 14px 32px rgba(0,0,0,0.35);
      }
      .muted { color: var(--muted); }
      .bad { color: var(--bad); }
      .good { color: var(--good); }
      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .row-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
      }
      .connections li {
        list-style: none;
        padding: 8px 10px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: rgba(255,255,255,0.03);
        margin-bottom: 8px;
      }
      @media (max-width: 1200px) {
        .layout { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <div>
        <div class="title">Workspace Studio</div>
        <div class="status" id="status">Loading…</div>
      </div>
      <div class="status">Editable source + live preview + workspace graph</div>
    </header>
    <main class="layout">
      <section class="panel">
        <div class="panel-head">
          <h2>Editor</h2>
          <div class="toolbar">
            <button id="zoomOutBtn" type="button">Zoom Out</button>
            <button id="zoomInBtn" type="button">Zoom In</button>
            <button id="saveBtn" type="button">Save & Render</button>
            <button id="clearBtn" type="button">Clear Workspace</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <select id="workspacePicker"></select>
          </div>
          <div class="layer-controls" id="layerControls"></div>
          <div class="zoombar">
            <div id="zoomState" class="zoom-state">Zoom unavailable</div>
          </div>
          <div id="workspaceDetails" class="muted" style="margin-bottom: 12px;"></div>
          <textarea id="sourceEditor" spellcheck="false"></textarea>
          <div id="saveMessage" class="muted" style="margin-top: 10px;"></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>Preview</h2>
          <span id="previewState" class="muted">Live</span>
        </div>
        <div class="panel-body">
          <div id="previewWrap" class="preview-wrap">
            <img id="previewImage" alt="Rendered diagram preview" />
          </div>
          <div class="section">
            <div class="muted" style="margin-bottom: 8px;">Connections touching this workspace</div>
            <ul id="connectionList" class="connections" style="padding: 0; margin: 0;"></ul>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head">
          <h2>All Workspaces</h2>
          <span id="workspaceCount" class="muted"></span>
        </div>
        <div class="panel-body">
          <div class="section" style="margin-top: 0; padding-top: 0; border-top: 0;">
            <div class="muted" style="margin-bottom: 8px;">Workspace graph</div>
            <div id="graphWrap" class="graph-wrap"></div>
          </div>
          <div id="workspaceCards" class="grid"></div>
          <div class="section">
            <h2 style="margin-bottom: 12px;">Create Node</h2>
            <form id="newNodeForm" class="grid">
              <div class="row-3">
                <input id="newNodeTitle" placeholder="Node title" />
                <input id="newNodeSummary" placeholder="Node summary" />
                <input id="newNodeParent" placeholder="Parent folder" />
              </div>
              <button type="submit">Create Workspace Node</button>
            </form>
          </div>
          <div class="section">
            <h2 style="margin-bottom: 12px;">Connect Nodes</h2>
            <form id="connectForm" class="grid">
              <div class="row">
                <select id="connectFrom"></select>
                <select id="connectTo"></select>
              </div>
              <input id="connectLabel" placeholder="Edge label (optional)" />
              <button type="submit">Create Connection</button>
            </form>
            <div class="section">
              <div class="muted" style="margin-bottom: 8px;">Global graph</div>
              <ul id="edgeList" class="connections" style="padding: 0; margin: 0;"></ul>
            </div>
          </div>
        </div>
      </section>
    </main>
    <script>
      const initialWorkspace = ${initialWorkspace};
      const state = {
        workspaceDir: initialWorkspace,
        payload: null,
      };

      const esc = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const els = {
        status: document.getElementById('status'),
        workspacePicker: document.getElementById('workspacePicker'),
        workspaceDetails: document.getElementById('workspaceDetails'),
        sourceEditor: document.getElementById('sourceEditor'),
        zoomOutBtn: document.getElementById('zoomOutBtn'),
        zoomInBtn: document.getElementById('zoomInBtn'),
        saveBtn: document.getElementById('saveBtn'),
        clearBtn: document.getElementById('clearBtn'),
        saveMessage: document.getElementById('saveMessage'),
        layerControls: document.getElementById('layerControls'),
        zoomState: document.getElementById('zoomState'),
        previewImage: document.getElementById('previewImage'),
        previewWrap: document.getElementById('previewWrap'),
        workspaceCards: document.getElementById('workspaceCards'),
        workspaceCount: document.getElementById('workspaceCount'),
        newNodeForm: document.getElementById('newNodeForm'),
        newNodeTitle: document.getElementById('newNodeTitle'),
        newNodeSummary: document.getElementById('newNodeSummary'),
        newNodeParent: document.getElementById('newNodeParent'),
        connectForm: document.getElementById('connectForm'),
        connectFrom: document.getElementById('connectFrom'),
        connectTo: document.getElementById('connectTo'),
        connectLabel: document.getElementById('connectLabel'),
        connectionList: document.getElementById('connectionList'),
        edgeList: document.getElementById('edgeList'),
        graphWrap: document.getElementById('graphWrap'),
      };

      async function fetchState(workspaceDir) {
        const response = await fetch('/api/state?workspace=' + encodeURIComponent(workspaceDir));
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return response.json();
      }

      function workspaceLabel(workspace) {
        return workspace.title || workspace.workspaceDir.split(/[\\/]/).pop();
      }

      function parentFolder(workspaceDir) {
        return String(workspaceDir ?? '').replace(/[\\/][^\\/]+$/, '');
      }

      function renderWorkspaceCards(payload) {
        els.workspaceCards.innerHTML = payload.workspaces.map((workspace) => {
          const active = workspace.workspaceDir === payload.selectedWorkspaceDir ? 'active' : '';
          return '<article class="card ' + active + '" data-workspace="' + esc(workspace.workspaceDir) + '">' +
            '<div class="card-title">' + esc(workspaceLabel(workspace)) + '</div>' +
            '<div class="card-sub">' + esc(workspace.workspaceDir) + '</div>' +
            '<div class="card-sub">' + esc(workspace.summary || 'No summary') + '</div>' +
          '</article>';
        }).join('');

        els.workspaceCards.querySelectorAll('[data-workspace]').forEach((card) => {
          card.addEventListener('click', () => loadWorkspace(card.getAttribute('data-workspace')));
        });
      }

      function renderWorkspacePicker(payload) {
        const options = payload.workspaces.map((workspace) => {
          const selected = workspace.workspaceDir === payload.selectedWorkspaceDir ? ' selected' : '';
          return '<option value="' + esc(workspace.workspaceDir) + '"' + selected + '>' + esc(workspaceLabel(workspace)) + '</option>';
        }).join('');
        els.workspacePicker.innerHTML = options;
        els.workspacePicker.value = payload.selectedWorkspaceDir;
      }

      function renderConnectionForms(payload) {
        const options = payload.workspaces.map((workspace) => '<option value="' + esc(workspace.workspaceDir) + '">' + esc(workspaceLabel(workspace)) + '</option>').join('');
        els.connectFrom.innerHTML = options;
        els.connectTo.innerHTML = options;
        els.connectFrom.value = payload.selectedWorkspaceDir;
        const other = payload.workspaces.find((workspace) => workspace.workspaceDir !== payload.selectedWorkspaceDir);
        if (other) {
          els.connectTo.value = other.workspaceDir;
        }
      }

      function renderLayerControls(payload) {
        if (!payload.selectedWorkspace || payload.selectedWorkspace.sourceKind !== 'node') {
          els.layerControls.innerHTML = '<span class="muted">Zoom controls appear for node workspaces.</span>';
          return;
        }

        const active = Number.isInteger(payload.selectedWorkspace.activeLayer) ? payload.selectedWorkspace.activeLayer : 0;
        const maxDepth = Number.isInteger(payload.selectedWorkspace.maxDepth) ? payload.selectedWorkspace.maxDepth : 2;
        const labels = ['Shell', 'Summary', 'Inner'];
        els.layerControls.innerHTML = labels.slice(0, maxDepth + 1).map((label, index) => {
          const className = 'layer-button' + (index === active ? ' active' : '');
          return '<button type="button" class="' + className + '" data-layer="' + index + '">' + esc(label) + '</button>';
        }).join('');

        els.layerControls.querySelectorAll('[data-layer]').forEach((button) => {
          button.addEventListener('click', () => zoomWorkspaceTo(Number(button.getAttribute('data-layer'))));
        });
      }

      function layoutGraph(payload) {
        const nodes = payload.workspaces || [];
        const edges = payload.edges || [];
        const width = 760;
        const height = Math.max(300, Math.min(580, 180 + nodes.length * 28));
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.max(90, Math.min(width, height) * 0.34);
        const pointMap = new Map();

        if (nodes.length === 1) {
          pointMap.set(nodes[0].workspaceDir, { x: centerX, y: centerY });
        } else if (nodes.length > 1) {
          nodes.forEach((workspace, index) => {
            const angle = (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            pointMap.set(workspace.workspaceDir, { x, y });
          });
        }

        const edgeSvg = edges
          .filter((edge) => pointMap.has(edge.fromWorkspaceDir) && pointMap.has(edge.toWorkspaceDir))
          .map((edge) => {
            const from = pointMap.get(edge.fromWorkspaceDir);
            const to = pointMap.get(edge.toWorkspaceDir);
            const active = edge.fromWorkspaceDir === payload.selectedWorkspaceDir || edge.toWorkspaceDir === payload.selectedWorkspaceDir ? ' active' : '';
            return '<line class="graph-link' + active + '" x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '"></line>';
          })
          .join('');

        const nodeSvg = nodes.map((workspace) => {
          const point = pointMap.get(workspace.workspaceDir) || { x: centerX, y: centerY };
          const active = workspace.workspaceDir === payload.selectedWorkspaceDir ? ' active' : '';
          const title = workspaceLabel(workspace);
          const summary = workspace.summary || 'No summary';
          const shortTitle = title.length > 16 ? title.slice(0, 15) + '…' : title;
          return [
            '<g class="graph-node' + active + '" data-workspace="' + esc(workspace.workspaceDir) + '" transform="translate(' + point.x + ',' + point.y + ')">',
            '<rect x="-70" y="-28" width="140" height="56" rx="16" ry="16" fill="#0b1222" stroke="' + (workspace.workspaceDir === payload.selectedWorkspaceDir ? '#7be0a4' : '#27314a') + '"></rect>',
            '<text class="graph-label" x="0" y="-2">' + esc(shortTitle) + '</text>',
            '<text class="graph-sub" x="0" y="14">' + esc(summary.length > 24 ? summary.slice(0, 23) + '…' : summary) + '</text>',
            '</g>',
          ].join('');
        }).join('');

        els.graphWrap.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet" aria-label="Workspace graph">' +
          '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="transparent"></rect>' +
          edgeSvg +
          nodeSvg +
          '</svg>';

        els.graphWrap.querySelectorAll('[data-workspace]').forEach((node) => {
          node.addEventListener('click', () => loadWorkspace(node.getAttribute('data-workspace')));
        });
      }

      function renderConnections(payload) {
        const related = payload.edges.filter((edge) => edge.fromWorkspaceDir === payload.selectedWorkspaceDir || edge.toWorkspaceDir === payload.selectedWorkspaceDir);
        els.connectionList.innerHTML = related.length
          ? related.map((edge) => '<li>' + esc(edge.fromWorkspaceDir) + ' → ' + esc(edge.toWorkspaceDir) + (edge.label ? ' (' + esc(edge.label) + ')' : '') + '</li>').join('')
          : '<li class="muted">No connections for this workspace yet.</li>';

        els.edgeList.innerHTML = payload.edges.length
          ? payload.edges.map((edge) => '<li>' + esc(edge.fromWorkspaceDir) + ' → ' + esc(edge.toWorkspaceDir) + (edge.label ? ' (' + esc(edge.label) + ')' : '') + '</li>').join('')
          : '<li class="muted">No connections yet.</li>';
      }

      function renderPayload(payload) {
        state.payload = payload;
        els.status.textContent = payload.previewError ? payload.previewError : 'Ready';
        els.workspaceCount.textContent = payload.workspaces.length + ' workspace(s)';
        els.workspaceDetails.textContent = payload.selectedWorkspace
          ? payload.selectedWorkspace.title + ' · ' + payload.selectedWorkspace.summary
          : 'No workspace selected';
        if (payload.selectedWorkspace) {
          const active = Number.isInteger(payload.selectedWorkspace.activeLayer) ? payload.selectedWorkspace.activeLayer : 0;
          const maxDepth = Number.isInteger(payload.selectedWorkspace.maxDepth) ? payload.selectedWorkspace.maxDepth : 2;
          const labels = ['Shell', 'Summary', 'Inner'];
          els.zoomState.textContent = 'Zoom ' + active + '/' + maxDepth + ' · ' + (labels[Math.min(active, labels.length - 1)] || 'Layer');
        } else {
          els.zoomState.textContent = 'Zoom unavailable';
        }
        const zoomable = payload.selectedWorkspace?.sourceKind === 'node';
        els.zoomInBtn.disabled = !zoomable;
        els.zoomOutBtn.disabled = !zoomable;
        renderLayerControls(payload);
        if (!els.newNodeParent.value.trim()) {
          els.newNodeParent.value = payload.selectedWorkspaceDir ? parentFolder(payload.selectedWorkspaceDir) : '';
        }
        els.sourceEditor.value = payload.sourceContent || '';
        els.previewWrap.innerHTML = payload.previewError
          ? '<div class="bad">' + esc(payload.previewError) + '</div>'
          : '<img id="previewImage" alt="Rendered diagram preview" src="' + esc(payload.previewUrl) + '" />';
        renderWorkspaceCards(payload);
        renderWorkspacePicker(payload);
        renderConnectionForms(payload);
        layoutGraph(payload);
        renderConnections(payload);
      }

      async function loadWorkspace(workspaceDir) {
        state.workspaceDir = workspaceDir;
        const payload = await fetchState(workspaceDir);
        history.replaceState(null, '', '?workspace=' + encodeURIComponent(payload.selectedWorkspaceDir));
        renderPayload(payload);
      }

      async function saveSource() {
        if (!state.payload?.selectedWorkspaceDir) return;
        els.saveMessage.textContent = 'Saving…';
        const response = await fetch('/api/source?workspace=' + encodeURIComponent(state.payload.selectedWorkspaceDir), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: els.sourceEditor.value }),
        });
        const payload = await response.json();
        if (!response.ok) {
          els.saveMessage.textContent = payload.error || 'Save failed';
          els.saveMessage.className = 'bad';
          return;
        }
        els.saveMessage.textContent = payload.warning ? 'Saved, but preview warned: ' + payload.warning : 'Saved and rendered';
        els.saveMessage.className = payload.warning ? 'bad' : 'good';
        await loadWorkspace(payload.selectedWorkspaceDir);
      }

      async function zoomWorkspace(delta) {
        if (!state.payload?.selectedWorkspaceDir) return;
        const current = Number.isInteger(state.payload.selectedWorkspace?.activeLayer) ? state.payload.selectedWorkspace.activeLayer : 0;
        const maxDepth = Number.isInteger(state.payload.selectedWorkspace?.maxDepth) ? state.payload.selectedWorkspace.maxDepth : 2;
        const targetLayer = Math.max(0, Math.min(current + delta, maxDepth));
        if (targetLayer === current) {
          return;
        }
        const response = await fetch('/api/zoom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceDir: state.payload.selectedWorkspaceDir,
            delta,
            targetLayer,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          els.saveMessage.textContent = payload.error || 'Zoom failed';
          els.saveMessage.className = 'bad';
          return;
        }
        els.saveMessage.textContent = payload.warning ? 'Zoom updated, but preview warned: ' + payload.warning : 'Zoom updated';
        els.saveMessage.className = payload.warning ? 'bad' : 'good';
        await loadWorkspace(payload.selectedWorkspaceDir);
      }

      async function zoomWorkspaceTo(targetLayer) {
        if (!state.payload?.selectedWorkspaceDir) return;
        const current = Number.isInteger(state.payload.selectedWorkspace?.activeLayer) ? state.payload.selectedWorkspace.activeLayer : 0;
        if (targetLayer === current) return;
        const response = await fetch('/api/zoom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceDir: state.payload.selectedWorkspaceDir,
            targetLayer,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          els.saveMessage.textContent = payload.error || 'Zoom failed';
          els.saveMessage.className = 'bad';
          return;
        }
        els.saveMessage.textContent = payload.warning ? 'Zoom updated, but preview warned: ' + payload.warning : 'Zoom updated';
        els.saveMessage.className = payload.warning ? 'bad' : 'good';
        await loadWorkspace(payload.selectedWorkspaceDir);
      }

      async function createWorkspaceNode(event) {
        event.preventDefault();
        const response = await fetch('/api/workspace-new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: els.newNodeTitle.value,
            summary: els.newNodeSummary.value,
            parentDir: els.newNodeParent.value || state.workspaceDir,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          els.saveMessage.textContent = payload.error || 'Create node failed';
          els.saveMessage.className = 'bad';
          return;
        }
        els.saveMessage.textContent = payload.warning ? 'Workspace node created, but preview warned: ' + payload.warning : 'Workspace node created';
        els.saveMessage.className = payload.warning ? 'bad' : 'good';
        els.newNodeTitle.value = '';
        els.newNodeSummary.value = '';
        await loadWorkspace(payload.selectedWorkspaceDir);
      }

      async function createConnection(event) {
        event.preventDefault();
        const response = await fetch('/api/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromWorkspaceDir: els.connectFrom.value,
            toWorkspaceDir: els.connectTo.value,
            label: els.connectLabel.value,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          els.saveMessage.textContent = payload.error || 'Connection failed';
          els.saveMessage.className = 'bad';
          return;
        }
        els.saveMessage.textContent = 'Connection created';
        els.saveMessage.className = 'good';
        await loadWorkspace(payload.selectedWorkspaceDir || state.workspaceDir);
      }

      async function clearCurrentWorkspace() {
        if (!state.payload?.selectedWorkspaceDir) return;
        const label = workspaceLabel(state.payload.selectedWorkspace);
        const confirmed = window.confirm('Clear ' + label + '? This resets the workspace contents and removes its connections.');
        if (!confirmed) return;

        const response = await fetch('/api/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceDir: state.payload.selectedWorkspaceDir,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          els.saveMessage.textContent = payload.error || 'Clear failed';
          els.saveMessage.className = 'bad';
          return;
        }
        els.saveMessage.textContent = 'Workspace cleared';
        els.saveMessage.className = 'good';
        await loadWorkspace(payload.selectedWorkspaceDir);
      }

      els.workspacePicker.addEventListener('change', () => loadWorkspace(els.workspacePicker.value));
      els.zoomOutBtn.addEventListener('click', () => zoomWorkspace(-1));
      els.zoomInBtn.addEventListener('click', () => zoomWorkspace(1));
      els.saveBtn.addEventListener('click', saveSource);
      els.clearBtn.addEventListener('click', clearCurrentWorkspace);
      els.newNodeForm.addEventListener('submit', createWorkspaceNode);
      els.connectForm.addEventListener('submit', createConnection);

      const params = new URLSearchParams(window.location.search);
      const initial = params.get('workspace') || initialWorkspace;
      loadWorkspace(initial).catch((error) => {
        els.status.textContent = error.message;
        els.status.className = 'bad';
      });
    </script>
  </body>
</html>`;
}

async function handleRequest(req, res, initialWorkspaceDir) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const selectedWorkspaceDir = url.searchParams.get('workspace') || initialWorkspaceDir;

  if (req.method === 'GET' && url.pathname === '/') {
    return sendHtml(res, studioHtml(initialWorkspaceDir));
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const state = await buildState(selectedWorkspaceDir);
    return sendJson(res, 200, state);
  }

  if (req.method === 'GET' && url.pathname === '/preview.png') {
    const workspaceDir = url.searchParams.get('workspace') || selectedWorkspaceDir;
    const outputFile = workspacePreviewPath(workspaceDir);
    if (!(await pathExists(outputFile))) {
      return sendText(res, 404, 'Preview not found');
    }

    const contentType = outputFile.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    const content = await fs.readFile(outputFile);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/source') {
    const workspaceDir = url.searchParams.get('workspace') || selectedWorkspaceDir;
    const snapshot = await readWorkspaceSnapshot(workspaceDir);
    const body = await readRequestBody(req);
    const content = String(body?.content ?? '');

    if (snapshot.sourceKind === 'node') {
      try {
        JSON.parse(content);
      } catch (error) {
        return sendJson(res, 400, { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
      }
    }

    await writeText(snapshot.sourceFile, content);
    let warning = null;
    try {
      await renderWorkspacePreview(workspaceDir);
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
    }

    return sendJson(res, 200, { ok: true, selectedWorkspaceDir: workspaceDir, warning });
  }

  if (req.method === 'POST' && url.pathname === '/api/zoom') {
    const body = await readRequestBody(req);
    const workspaceDir = body.workspaceDir || selectedWorkspaceDir;
    const hasTarget = Number.isInteger(body.targetLayer);
    const hasDelta = Number.isInteger(body.delta);

    if (!workspaceDir || (!hasTarget && !hasDelta)) {
      return sendJson(res, 400, { error: 'workspaceDir and a zoom target are required' });
    }

    try {
      const snapshot = await readWorkspaceSnapshot(workspaceDir);
      const active = Number.isInteger(snapshot?.workspace?.node?.activeLayer) ? snapshot.workspace.node.activeLayer : 0;
      const maxDepth = Number.isInteger(snapshot?.workspace?.node?.maxDepth) ? snapshot.workspace.node.maxDepth : 2;
      const targetLayer = hasTarget
        ? Math.max(0, Math.min(body.targetLayer, maxDepth))
        : Math.max(0, Math.min(active + body.delta, maxDepth));
      await setWorkspaceZoomLevel(workspaceDir, targetLayer);
      let warning = null;
      try {
        await renderWorkspacePreview(workspaceDir);
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
      return sendJson(res, 200, { ok: true, selectedWorkspaceDir: workspaceDir, targetLayer, warning });
    } catch (error) {
      return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/workspace-new') {
    const body = await readRequestBody(req);
    try {
      const selectedWorkspaceDir = await createWorkspaceNode({
        title: body.title,
        summary: body.summary,
        parentDir: body.parentDir,
      });
      let warning = null;
      try {
        await renderWorkspacePreview(selectedWorkspaceDir);
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
      return sendJson(res, 200, { ok: true, selectedWorkspaceDir, warning });
    } catch (error) {
      return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/clear') {
    const body = await readRequestBody(req);
    const workspaceDir = body.workspaceDir || selectedWorkspaceDir;
    if (!workspaceDir) {
      return sendJson(res, 400, { error: 'workspaceDir is required' });
    }

    try {
      const result = await clearWorkspace(workspaceDir);
      let warning = null;
      try {
        await renderWorkspacePreview(workspaceDir);
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
      return sendJson(res, 200, { ok: true, selectedWorkspaceDir: result.workspaceDir, warning });
    } catch (error) {
      return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/connect') {
    const body = await readRequestBody(req);
    try {
      const graph = await addWorkspaceConnection(
        body.fromWorkspaceDir,
        body.toWorkspaceDir,
        body.label,
      );
      return sendJson(res, 200, {
        ok: true,
        selectedWorkspaceDir: body.fromWorkspaceDir,
        edges: graph.edges,
      });
    } catch (error) {
      return sendJson(res, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return sendText(res, 404, 'Not found');
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const initialWorkspaceDir = await resolveInitialWorkspace(process.argv[2]);
await ensureWorkspacePreview(initialWorkspaceDir).catch(() => {});

const server = http.createServer((req, res) => {
  handleRequest(req, res, initialWorkspaceDir).catch((error) => {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  });
});

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve(typeof address === 'object' && address ? address.port : 0);
  });
});

const studioUrl = `http://127.0.0.1:${port}/?workspace=${encodeURIComponent(initialWorkspaceDir)}`;
console.log(`workspace-server: ${studioUrl}`);
if (!process.env.NO_BROWSER && !process.env.CI) {
  openBrowser(studioUrl);
}

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
