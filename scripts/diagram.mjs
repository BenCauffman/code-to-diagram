#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { select } from '@inquirer/prompts';
import {
  describeWorkspaceSnapshot,
  formatWorkspaceStatusCard,
  chooseRegisteredWorkspace,
  confirmWorkspaceDeletion,
  deleteWorkspace,
  ensureWorkspace,
  findWorkspaceConfigDir,
  isProtectedWorkspace,
  listWorkspaces,
  promptForWorkspaceFolder,
  promptForWorkspaceSelection,
  readRegistry,
  readWorkspaceSnapshot,
  startWorkspaceSession,
  safeCurrentWorkingDirectory,
} from './workspace-core.mjs';
const commandArg = process.argv[2];

function commandLabel(currentWorkspace) {
  return currentWorkspace ? `What do you want to do? (${currentWorkspace})` : 'What do you want to do?';
}

function printHelp() {
  console.log(`Usage:
  diagram

Interactive launcher for workspace selection, create, delete, and list actions.

Actions:
  open     Search saved workspaces, open one, and launch the studio
  new      Browse folders, create a workspace, and launch the studio
  delete   Remove a workspace from disk and unregister it
  list     Show initialized workspaces
  exit     Close the launcher

Notes:
  The project root workspace is protected and will not appear in delete search.

Examples:
  diagram
  diagram --help
`);
}

async function ensureActiveWorkspace(activeWorkspace) {
  if (activeWorkspace) {
    return activeWorkspace;
  }

  const selected = await promptForWorkspaceSelection();
  if (!selected) {
    return null;
  }

  const { workspaceDir } = await ensureWorkspace(selected);
  return workspaceDir;
}

async function deleteWorkspaceAction(currentWorkspace) {
  const registered = (await readRegistry()).filter((workspace) => !isProtectedWorkspace(workspace));
  if (registered.length === 0) {
    console.log('No deletable workspaces found.');
    return currentWorkspace;
  }

  const selected = await chooseRegisteredWorkspace(registered, 'Search workspace to delete');
  if (!selected) {
    return currentWorkspace;
  }

  const confirmed = await confirmWorkspaceDeletion(selected);
  if (!confirmed) {
    return currentWorkspace;
  }

  const deleted = await deleteWorkspace(selected);
  console.log(`Deleted workspace: ${deleted}`);

  if (currentWorkspace && path.resolve(currentWorkspace) === deleted) {
    return null;
  }

  return currentWorkspace;
}

async function openStudio(workspaceDir) {
  await startWorkspaceSession(workspaceDir);
}

function printWorkspaceDetails(workspaceDir, sourceResult, details = {}) {
  console.log(formatWorkspaceStatusCard({
    workspaceDir,
    sourceFile: sourceResult.targetFile,
    outputFile: path.join(workspaceDir, 'diagram.png'),
    details,
    sections: details.sections,
  }));
}

let activeWorkspace = findWorkspaceConfigDir(safeCurrentWorkingDirectory());

if (commandArg === '--help' || commandArg === '-h' || commandArg === 'help') {
  printHelp();
  process.exit(0);
}

if (commandArg) {
  console.error(`diagram: unknown command: ${commandArg}`);
  printHelp();
  process.exit(1);
}

while (true) {
  const choice = await select({
    message: commandLabel(activeWorkspace),
    choices: [
      { value: 'open', name: 'Open workspace', description: 'Search saved workspaces.' },
      { value: 'new', name: 'Create workspace', description: 'Make a new workspace folder.' },
      { value: 'delete', name: 'Delete workspace', description: 'Remove a registered workspace.' },
      { value: 'list', name: 'List workspaces', description: 'Show saved workspaces.' },
      { value: 'exit', name: 'Exit', description: 'Close the launcher.' },
    ],
  });

  if (choice === 'exit') {
    break;
  }

  if (choice === 'list') {
    await listWorkspaces();
    continue;
  }

  if (choice === 'open') {
    const selected = await promptForWorkspaceSelection();
    if (!selected) {
      continue;
    }
    const result = await ensureWorkspace(selected);
    activeWorkspace = result.workspaceDir;
    const snapshot = await readWorkspaceSnapshot(activeWorkspace);
    printWorkspaceDetails(activeWorkspace, result.sourceResult, describeWorkspaceSnapshot(snapshot));
    await openStudio(activeWorkspace);
    continue;
  }

  if (choice === 'new') {
    const targetDir = await promptForWorkspaceFolder(path.join(os.homedir(), 'Projects', 'diagrams'));
    if (!targetDir) {
      continue;
    }
    const result = await ensureWorkspace(targetDir);
    activeWorkspace = result.workspaceDir;
    const snapshot = await readWorkspaceSnapshot(activeWorkspace);
    printWorkspaceDetails(activeWorkspace, result.sourceResult, describeWorkspaceSnapshot(snapshot));
    await openStudio(activeWorkspace);
    continue;
  }

  if (choice === 'delete') {
    activeWorkspace = await deleteWorkspaceAction(activeWorkspace);
    continue;
  }

  const workspaceDir = await ensureActiveWorkspace(activeWorkspace);
  if (!workspaceDir) {
    continue;
  }
  activeWorkspace = workspaceDir;
  await openStudio(activeWorkspace);
}
