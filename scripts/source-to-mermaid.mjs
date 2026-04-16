#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  nodeWorkspaceToMermaid,
  readNodeWorkspace,
} from './node-workspace.mjs';

function extractMermaidFromMarkdown(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const mermaid = [];
  let inBlock = false;

  for (const line of lines) {
    if (!inBlock && /^```mermaid\s*$/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^```\s*$/.test(line)) {
      break;
    }
    if (inBlock) {
      mermaid.push(line);
    }
  }

  return mermaid.join('\n');
}

const sourceFile = process.argv[2];

if (!sourceFile) {
  console.error('source-to-mermaid: missing source file path');
  process.exit(1);
}

const absoluteSourceFile = path.resolve(sourceFile);
const raw = await fs.readFile(absoluteSourceFile, 'utf8');

if (absoluteSourceFile.endsWith('.json')) {
  const workspace = await readNodeWorkspace(absoluteSourceFile);
  console.log(nodeWorkspaceToMermaid(workspace));
} else {
  const mermaid = extractMermaidFromMarkdown(raw);
  if (!mermaid.trim()) {
    console.error(`source-to-mermaid: no Mermaid block found in ${absoluteSourceFile}`);
    process.exit(1);
  }
  console.log(mermaid);
}
