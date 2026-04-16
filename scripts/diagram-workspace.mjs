#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  describeWorkspaceSnapshot,
  confirmWorkspaceDeletion,
  chooseRegisteredWorkspace,
  deleteWorkspace,
  ensureWorkspace,
  isProtectedWorkspace,
  listWorkspaces,
  promptForWorkspaceFolder,
  promptForWorkspaceSelection,
  readRegistry,
  readWorkspaceSnapshot,
  formatWorkspaceStatusCard,
  startWorkspaceSession,
} from './workspace-core.mjs';

function printHelp() {
  console.log(`Usage:
  diagram-workspace
  diagram-workspace open
  diagram-workspace new
  diagram-workspace delete
  diagram-workspace list

Commands:
  open     Search saved workspaces, open one, and launch the studio
  new      Browse folders, create a workspace, and launch the studio
  delete   Remove a workspace from disk and unregister it
  list     Show initialized workspaces

Notes:
  The project root workspace is protected and will not appear in delete search.

Examples:
  diagram-workspace open
  diagram-workspace new
  diagram-workspace delete
`);
}

function printWorkspaceSummary(workspaceDir, sourceResult, details = {}) {
  console.log(formatWorkspaceStatusCard({
    workspaceDir,
    sourceFile: sourceResult.targetFile,
    outputFile: path.join(workspaceDir, 'diagram.png'),
    details,
    sections: details.sections,
  }));
}

async function openWorkspace() {
  const selected = await promptForWorkspaceSelection();
  if (!selected) return;
  const result = await ensureWorkspace(selected);
  const snapshot = await readWorkspaceSnapshot(result.workspaceDir);
  printWorkspaceSummary(result.workspaceDir, result.sourceResult, describeWorkspaceSnapshot(snapshot));
  await startWorkspaceSession(result.workspaceDir);
}

async function deleteWorkspaceFlow() {
  const registered = (await readRegistry()).filter((workspace) => !isProtectedWorkspace(workspace));
  if (registered.length === 0) {
    console.log('No deletable workspaces found.');
    return;
  }

  const selected = await chooseRegisteredWorkspace(registered, 'Search workspace to delete');
  if (!selected) return;

  const confirmed = await confirmWorkspaceDeletion(selected);
  if (!confirmed) return;

  const deleted = await deleteWorkspace(selected);
  console.log(`Deleted workspace: ${deleted}`);
}

async function createWorkspace() {
  const targetDir = await promptForWorkspaceFolder(path.join(os.homedir(), 'Projects', 'diagrams'));
  if (!targetDir) return;
  const result = await ensureWorkspace(targetDir);
  const snapshot = await readWorkspaceSnapshot(result.workspaceDir);
  printWorkspaceSummary(result.workspaceDir, result.sourceResult, describeWorkspaceSnapshot(snapshot));
  await startWorkspaceSession(result.workspaceDir);
}

const command = process.argv[2] ?? 'open';

try {
  if (command === 'list') {
    await listWorkspaces();
  } else if (command === 'open' || command === 'configure' || command === 'init' || command === 'edit') {
    await openWorkspace();
  } else if (command === 'new') {
    await createWorkspace();
  } else if (command === 'delete' || command === 'remove' || command === 'rm') {
    await deleteWorkspaceFlow();
  } else if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
  } else {
    console.error(`diagram-workspace: unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
} catch (error) {
  if (error && error.name === 'ExitPromptError') {
    process.exit(130);
  }
  console.error(`diagram-workspace: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
