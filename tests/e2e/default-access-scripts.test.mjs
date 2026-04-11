import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  getDefaultInstallationManifestPath,
  renderCodexMcpServerBlock,
  renderWindowsCmdShim,
  upsertCodexMcpServerBlock
} from "../../scripts/lib/default-access.mjs";

test("upsertCodexMcpServerBlock inserts a new MultiAgentBrain server under mcp_servers", () => {
  const original = `model = "gpt-5.4"

[mcp_servers]
[mcp_servers.playwright]
command = 'npx'
args = ['@playwright/mcp@latest']
`;

  const next = upsertCodexMcpServerBlock(
    original,
    "multiagentbrain",
    "node",
    ["F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain\\scripts\\launch-brain-mcp.mjs"]
  );

  assert.match(next, /\[mcp_servers\.multiagentbrain\]/);
  assert.match(next, /command = 'node'/);
  assert.match(next, /launch-brain-mcp\.mjs/);
  assert.match(next, /\[mcp_servers\.playwright\]/);
});

test("upsertCodexMcpServerBlock replaces an existing MultiAgentBrain block without duplicating it", () => {
  const original = `model = "gpt-5.4"

[mcp_servers]
[mcp_servers.multiagentbrain]
command = 'old-node'
args = ['old-script.mjs']

[mcp_servers.codesight]
command = 'codesight.cmd'
args = ['--mcp']
`;

  const next = upsertCodexMcpServerBlock(
    original,
    "multiagentbrain",
    "node",
    ["F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain\\scripts\\launch-brain-mcp.mjs"]
  );

  assert.equal((next.match(/\[mcp_servers\.multiagentbrain\]/g) ?? []).length, 1);
  assert.doesNotMatch(next, /old-script\.mjs/);
  assert.match(next, /launch-brain-mcp\.mjs/);
  assert.match(next, /\[mcp_servers\.codesight\]/);
});

test("renderCodexMcpServerBlock emits a complete TOML block", () => {
  const block = renderCodexMcpServerBlock(
    "multiagentbrain",
    "node",
    ["F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain\\scripts\\launch-brain-mcp.mjs"]
  );

  assert.match(block, /^\[mcp_servers\.multiagentbrain\]/);
  assert.match(block, /command = 'node'/);
  assert.ok(
    block.includes(
      "args = ['F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain\\scripts\\launch-brain-mcp.mjs']"
    )
  );
});

test("renderWindowsCmdShim targets the tracked CLI wrapper with forwarded args", () => {
  const shim = renderWindowsCmdShim(
    "node",
    "F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain\\scripts\\launch-brain-cli.mjs"
  );

  assert.match(shim, /@echo off/i);
  assert.match(shim, /launch-brain-cli\.mjs/);
  assert.match(shim, /%\\*/);
});

test("getDefaultInstallationManifestPath points at the fixed user-level manifest location", () => {
  assert.equal(
    getDefaultInstallationManifestPath("C:\\Users\\vikel"),
    "C:\\Users\\vikel\\.multiagentbrain\\installation.json"
  );
});

test("doctor-default-access reports unavailable before installation", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "mab-doctor-missing-"));
  const manifestPath = path.join(tempRoot, "installation.json");
  const configPath = path.join(tempRoot, "config.toml");
  const binDir = path.join(tempRoot, "bin");
  const repoRoot = path.resolve("F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain");

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "doctor-default-access.mjs"),
      "--json",
      "--repo-root",
      repoRoot,
      "--config",
      configPath,
      "--bin-dir",
      binDir,
      "--manifest",
      manifestPath
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "C:\\Windows\\System32"
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "unavailable");
  assert.equal(payload.manifest.exists, false);
  assert.equal(payload.launchers.onPath, false);
  assert.equal(payload.codexMcp.configured, false);
});

test("install-default-access writes launchers, codex config, and manifest that doctor recognizes", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "mab-install-"));
  const manifestPath = path.join(tempRoot, "installation.json");
  const configPath = path.join(tempRoot, "config.toml");
  const binDir = path.join(tempRoot, "bin");
  const repoRoot = path.resolve("F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain");
  const install = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "install-default-access.mjs"),
      "--repo-root",
      repoRoot,
      "--config",
      configPath,
      "--bin-dir",
      binDir,
      "--manifest",
      manifestPath
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir};C:\\Windows\\System32`
      }
    }
  );

  assert.equal(install.status, 0, install.stderr);
  assert.equal(existsSync(path.join(binDir, "multiagentbrain.cmd")), true);
  assert.equal(existsSync(path.join(binDir, "mab.cmd")), true);
  assert.match(readFileSync(configPath, "utf8"), /\[mcp_servers\.multiagentbrain\]/);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.installation.launcherBinDir, binDir);
  assert.equal(manifest.installation.codexConfigPath, configPath);

  const doctor = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "doctor-default-access.mjs"),
      "--json",
      "--repo-root",
      repoRoot,
      "--config",
      configPath,
      "--bin-dir",
      binDir,
      "--manifest",
      manifestPath
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir};C:\\Windows\\System32`
      }
    }
  );

  assert.equal(doctor.status, 0, doctor.stderr);
  const payload = JSON.parse(doctor.stdout);
  assert.equal(payload.status, "healthy");
  assert.equal(payload.manifest.exists, true);
  assert.equal(payload.launchers.onPath, true);
  assert.equal(payload.codexMcp.configured, true);
});

test("launch-brain-cli routes doctor requests to the machine-readable access report", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "mab-launcher-doctor-"));
  const manifestPath = path.join(tempRoot, "installation.json");
  const configPath = path.join(tempRoot, "config.toml");
  const binDir = path.join(tempRoot, "bin");
  const repoRoot = path.resolve("F:\\Dev\\scripts\\MultiagentBrain\\multi-agent-brain");
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "launch-brain-cli.mjs"),
      "doctor",
      "--json",
      "--repo-root",
      repoRoot,
      "--config",
      configPath,
      "--bin-dir",
      binDir,
      "--manifest",
      manifestPath
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "C:\\Windows\\System32"
      }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, "unavailable");
});
