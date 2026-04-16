#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

export const WORKSPACE_SCHEMA_VERSION = 1;
export const DEFAULT_NODE_MAX_DEPTH = 2;

export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'node';
}

export function titleize(value) {
  const words = String(value ?? '')
    .trim()
    .replace(/[-_.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'Node';

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function defaultNodeWorkspace(workspaceDir, { title, summary, sections } = {}) {
  const workspaceId = slugify(path.basename(workspaceDir));
  const nodeTitle = title?.trim() ? title.trim() : titleize(path.basename(workspaceDir));

  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    workspaceId,
    node: {
      id: workspaceId,
      title: nodeTitle,
      summary: summary?.trim() ? summary.trim() : `Workspace node for ${nodeTitle}.`,
      activeLayer: 0,
      maxDepth: DEFAULT_NODE_MAX_DEPTH,
      layers: [
        { level: 0, kind: 'shell', visible: ['title'] },
        { level: 1, kind: 'summary', visible: ['title', 'summary'] },
        { level: 2, kind: 'inner', visible: ['title', 'summary', 'sections'] },
      ],
      sections: Array.isArray(sections) && sections.length > 0 ? sections : [
        {
          id: 'inner-view',
          title: 'Inner View',
          body: 'Add details here to reveal the inside of the node when you zoom in.',
        },
      ],
      children: [],
      constraints: {
        sameIdentityAcrossLayers: true,
        noFreeformExpansion: true,
      },
    },
  };
}

export async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function normalizeZoomLevel(node) {
  const maxDepth = Number.isInteger(node?.maxDepth) ? node.maxDepth : DEFAULT_NODE_MAX_DEPTH;
  const activeLayer = Number.isInteger(node?.activeLayer) ? node.activeLayer : 0;
  return Math.max(0, Math.min(activeLayer, maxDepth));
}

function escapeMermaidLabel(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '<br/>');
}

function mermaidId(value) {
  return slugify(value).replace(/-/g, '_');
}

export function nodeWorkspaceToMermaid(workspace) {
  const node = workspace?.node ?? {};
  const layer = normalizeZoomLevel(node);
  const maxDepth = Number.isInteger(node.maxDepth) ? node.maxDepth : DEFAULT_NODE_MAX_DEPTH;
  const title = escapeMermaidLabel(node.title ?? workspace.workspaceId ?? 'Node');
  const summary = escapeMermaidLabel(node.summary ?? '');
  const lines = ['flowchart TD'];
  const shellId = mermaidId(node.id ?? workspace.workspaceId ?? 'node');

  lines.push(`  ${shellId}["${title}"]`);

  if (layer >= 1) {
    const summaryId = `${shellId}_summary`;
    lines.push(`  ${shellId} --> ${summaryId}["${summary}"]`);

    if (layer >= 2 && maxDepth >= 2) {
      const sections = Array.isArray(node.sections) ? node.sections : [];
      if (sections.length > 0) {
        lines.push(`  subgraph "Inner View"`);
        sections.forEach((section, index) => {
          const sectionId = `${shellId}_${index + 1}_${mermaidId(section.id ?? section.title ?? 'section')}`;
          const sectionTitle = escapeMermaidLabel(section.title ?? 'Section');
          const sectionBody = escapeMermaidLabel(section.body ?? '');
          lines.push(`    ${sectionId}["${sectionTitle}<br/>${sectionBody}"]`);
          lines.push(`    ${summaryId} --> ${sectionId}`);
        });
        lines.push('  end');
      } else {
        const placeholderId = `${shellId}_inner`;
        lines.push(`  ${summaryId} --> ${placeholderId}["Inner view"]`);
      }
    }
  }

  return lines.join('\n');
}

export function workspaceZoomLabel(activeLayer, maxDepth) {
  if (!Number.isInteger(activeLayer) || !Number.isInteger(maxDepth)) {
    return 'Legacy';
  }

  const labels = ['Shell', 'Summary', 'Inner'];
  return labels[Math.min(activeLayer, labels.length - 1)] ?? 'Layer';
}

function padRight(value, width) {
  const text = String(value ?? '');
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function compactPath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = path.resolve(raw);
  const parts = normalized.split(path.sep).filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `…${path.sep}${parts.slice(-2).join(path.sep)}`;
}

function wrapText(value, width) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = words.shift();
  for (const word of words) {
    if ((current + ' ' + word).length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function formatWorkspaceStatusCard({
  workspaceDir,
  sourceFile,
  outputFile,
  details,
  sections,
} = {}) {
  const title = details?.title ?? 'Workspace';
  const summary = details?.summary ?? '';
  const zoomLabel = workspaceZoomLabel(details?.activeLayer, details?.maxDepth);
  const zoomValue = Number.isInteger(details?.activeLayer) && Number.isInteger(details?.maxDepth)
    ? `${details.activeLayer}/${details.maxDepth}`
    : 'legacy';
  const workspaceName = path.basename(workspaceDir ?? '') || 'Workspace';
  const sourceLabel = path.basename(sourceFile ?? '') || '(none)';
  const outputLabel = path.basename(outputFile ?? '') || '(none)';
  const directoryLabel = compactPath(workspaceDir);

  const previewSections = Array.isArray(sections) ? sections.slice(0, 3) : [];
  const previewLines = [];
  if (previewSections.length > 0) {
    previewLines.push('Inner sections:');
    for (const section of previewSections) {
      previewLines.push(`  - ${section.title ?? 'Section'}`);
    }
  }

  const rawLines = [
    'NODE WORKSPACE',
    `Node: ${title}`,
    `Workspace: ${workspaceName}`,
    `Zoom: ${zoomValue}  ${zoomLabel}`,
    summary ? `Summary: ${summary}` : 'Summary: (empty)',
    `Directory: ${directoryLabel || '(unknown)'}`,
    `Source: ${sourceLabel}`,
    `Output: ${outputLabel}`,
    ...previewLines,
  ];

  const normalized = rawLines.flatMap((line) => wrapText(line, 58));
  const width = Math.max(...normalized.map((line) => line.length), 20);
  const border = `╭${'─'.repeat(width + 2)}╮`;
  const footer = `╰${'─'.repeat(width + 2)}╯`;
  const body = normalized.map((line) => `│ ${padRight(line, width)} │`);

  return [border, ...body, footer].join('\n');
}

export async function readNodeWorkspace(filePath) {
  const workspace = await readJsonFile(filePath);
  if (workspace.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
    throw new Error(`unsupported workspace schema version: ${workspace.schemaVersion}`);
  }
  return workspace;
}

export async function writeNodeWorkspace(filePath, workspace) {
  await writeJsonFile(filePath, workspace);
}

export async function bumpWorkspaceLayer(filePath, delta) {
  const workspace = await readNodeWorkspace(filePath);
  const node = workspace.node ?? {};
  const current = normalizeZoomLevel(node);
  const maxDepth = Number.isInteger(node.maxDepth) ? node.maxDepth : DEFAULT_NODE_MAX_DEPTH;
  node.activeLayer = Math.max(0, Math.min(current + delta, maxDepth));
  workspace.node = node;
  await writeNodeWorkspace(filePath, workspace);
  return workspace;
}
