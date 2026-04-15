#!/usr/bin/env node
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { select } from '@inquirer/prompts';
import {
  DEFAULT_FILES,
  ensureWorkspace,
  findWorkspaceConfigDir,
  listWorkspaces,
  promptForWorkspaceSelection,
} from './workspace-core.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const commandArg = process.argv[2];

const commandCandidates = {
  render: ['render-diagram.sh', 'render-diagram'],
  watch: ['watch-diagram.sh', 'watch-diagram'],
  archive: ['archive-diagram.sh', 'archive-diagram'],
};

function commandLabel(currentWorkspace) {
  return currentWorkspace ? `What do you want to do? (${currentWorkspace})` : 'What do you want to do?';
}

function printHelp() {
  console.log(`Usage:
  diagram

Interactive launcher for workspace selection, render, watch, archive, and list actions.
`);
}

async function resolveInvoker(kind) {
  for (const candidate of commandCandidates[kind] ?? []) {
    const localPath = path.join(scriptDir, candidate);
    if (fsSync.existsSync(localPath)) {
      return localPath;
    }
  }
  return commandCandidates[kind]?.[1] ?? kind;
}

function openSourceFile(filePath) {
  if (process.platform === 'darwin') {
    const child = spawn('open', ['-t', filePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  }

  return false;
}

function spawnCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`command terminated by signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`command exited with code ${code}`));
    });
  });
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

async function runAction(kind, workspaceDir) {
  const command = await resolveInvoker(kind);
  await spawnCommand(command, workspaceDir);
}

function printWorkspaceSummary(workspaceDir) {
  console.log(`Workspace ready: ${workspaceDir}`);
  console.log(`Source file: ${path.join(workspaceDir, DEFAULT_FILES.source)}`);
  console.log(`Image file: ${path.join(workspaceDir, DEFAULT_FILES.output)}`);
  console.log(`Archive dir: ${path.join(workspaceDir, DEFAULT_FILES.archiveDir)}`);
}

let activeWorkspace = findWorkspaceConfigDir(process.cwd());

if (commandArg === '--help' || commandArg === '-h' || commandArg === 'help') {
  printHelp();
  process.exit(0);
}

while (true) {
  const choice = await select({
    message: commandLabel(activeWorkspace),
    choices: [
      { value: 'workspace', name: 'Open or create workspace', description: 'Pick a workspace to keep using.' },
      { value: 'render', name: 'Render diagram', description: 'Generate the current image.' },
      { value: 'watch', name: 'Watch diagram', description: 'Live preview while you edit.' },
      { value: 'archive', name: 'Archive diagram', description: 'Save the current source + image.' },
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

  if (choice === 'workspace') {
    const selected = await promptForWorkspaceSelection({
      existingDefault: activeWorkspace ?? process.cwd(),
    });
    if (!selected) {
      continue;
    }
    const { workspaceDir } = await ensureWorkspace(selected);
    activeWorkspace = workspaceDir;
    printWorkspaceSummary(activeWorkspace);
    continue;
  }

  const workspaceDir = await ensureActiveWorkspace(activeWorkspace);
  if (!workspaceDir) {
    continue;
  }
  activeWorkspace = workspaceDir;
  if (choice === 'watch') {
    const sourceFile = path.join(workspaceDir, DEFAULT_FILES.source);
    const opened = openSourceFile(sourceFile);
    if (!opened) {
      console.log(`Open ${sourceFile} in your editor, then keep this terminal running for live preview.`);
    }
  }
  await runAction(choice, workspaceDir);
}
