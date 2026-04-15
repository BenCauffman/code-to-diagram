#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  ensureWorkspace,
  listWorkspaces,
  promptForNewFolder,
  promptForWorkspaceSelection,
  readRegistry,
} from './workspace-core.mjs';

function printHelp() {
  console.log(`Usage:
  diagram-workspace
  diagram-workspace open
  diagram-workspace new
  diagram-workspace list
`);
}

function printWorkspaceSummary(workspaceDir, sourceResult) {
  console.log(`Workspace ready: ${workspaceDir}`);
  console.log(`Source file: ${sourceResult.targetFile}`);
  console.log(`Image file: ${path.join(workspaceDir, 'diagram.png')}`);
  console.log(`Archive dir: ${path.join(workspaceDir, 'past-diagrams')}`);
}

async function openWorkspace() {
  const selected = await promptForWorkspaceSelection();
  if (!selected) return;
  const { workspaceDir, sourceResult } = await ensureWorkspace(selected);
  printWorkspaceSummary(workspaceDir, sourceResult);
}

async function createWorkspace() {
  const targetDir = await promptForNewFolder(
    'New workspace folder',
    path.join(os.homedir(), 'Projects', 'diagrams'),
  );
  const { workspaceDir, sourceResult } = await ensureWorkspace(targetDir);
  printWorkspaceSummary(workspaceDir, sourceResult);
}

const command = process.argv[2] ?? 'open';

try {
  if (command === 'list') {
    await listWorkspaces();
  } else if (command === 'open' || command === 'configure' || command === 'init' || command === 'edit') {
    await openWorkspace();
  } else if (command === 'new') {
    await createWorkspace();
  } else if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  if (error && error.name === 'ExitPromptError') {
    process.exit(130);
  }
  console.error(`diagram-workspace: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
