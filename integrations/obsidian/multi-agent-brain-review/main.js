const { Plugin, PluginSettingTab, Setting, ItemView, Notice, MarkdownRenderer } = require("obsidian");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const VIEW_TYPE = "multi-agent-brain-review-view";
const DEFAULT_SETTINGS = {
  repoRoot: "",
  nodeExecutable: "node"
};

class BrainCliError extends Error {}

class BrainReviewClient {
  constructor(plugin) {
    this.plugin = plugin;
  }

  async listReviewQueue() {
    const response = await this.#runCli("list-review-queue", {});
    return response.data?.items ?? [];
  }

  async readReviewNote(draftNoteId) {
    const response = await this.#runCli("read-review-note", { draftNoteId });
    return response.data ?? {};
  }

  async acceptNote(draftNoteId) {
    const response = await this.#runCli("accept-note", { draftNoteId });
    return response.data ?? {};
  }

  async rejectNote(draftNoteId) {
    const response = await this.#runCli("reject-note", { draftNoteId });
    return response.data ?? {};
  }

  async #runCli(command, payload) {
    const settings = this.plugin.settings;
    if (!settings.repoRoot) {
      throw new BrainCliError("Set the Multi-Agent-Brain repo root in plugin settings first.");
    }

    const cliEntry = path.join(settings.repoRoot, "apps", "brain-cli", "dist", "main.js");
    try {
      await fs.access(cliEntry);
    } catch {
      throw new BrainCliError(
        `Could not find built brain-cli entrypoint at ${cliEntry}. Run corepack pnpm build in the repo first.`
      );
    }

    const requestPath = path.join(
      os.tmpdir(),
      `mab-review-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
    await fs.writeFile(requestPath, JSON.stringify(payload), "utf8");

    try {
      const completed = await execFileAsync(
        settings.nodeExecutable || "node",
        [cliEntry, command, "--input", requestPath],
        {
          cwd: settings.repoRoot,
          windowsHide: true,
          maxBuffer: 1024 * 1024
        }
      );
      const stdout = (completed.stdout ?? "").trim();
      let response = {};
      try {
        response = stdout ? JSON.parse(stdout) : {};
      } catch (error) {
        throw new BrainCliError(
          `Failed to parse brain-cli output for ${command}: ${error.message}\n${stdout || completed.stderr || ""}`
        );
      }

      if (response.ok === false) {
        throw new BrainCliError(response.error?.message || `${command} failed.`);
      }

      return response;
    } catch (error) {
      if (error instanceof BrainCliError) {
        throw error;
      }

      if (error?.code === "ENOENT") {
        throw new BrainCliError(
          `Could not find Node executable \`${settings.nodeExecutable || "node"}\`. Update the plugin setting or install Node on PATH.`
        );
      }

      const stderr = error?.stderr?.trim?.() || "";
      const stdout = error?.stdout?.trim?.() || "";
      throw new BrainCliError(
        stderr ||
          stdout ||
          error?.message ||
          `Failed to execute ${command} through brain-cli.`
      );
    } finally {
      await fs.unlink(requestPath).catch(() => undefined);
    }
  }
}

class ReviewQueueView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.client = new BrainReviewClient(plugin);
    this.queue = [];
    this.currentIndex = 0;
    this.currentNote = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "MAB Review Queue";
  }

  getIcon() {
    return "clipboard-list";
  }

  async onOpen() {
    this.#buildShell();
    await this.reloadQueue();
  }

  async reloadQueue(preserveDraftId) {
    this.#setStatus("Loading review queue...");
    try {
      this.queue = await this.client.listReviewQueue();
    } catch (error) {
      this.queue = [];
      this.currentNote = null;
      this.#renderEmpty(error.message);
      new Notice(error.message, 6000);
      return;
    }

    if (!this.queue.length) {
      this.currentIndex = 0;
      this.currentNote = null;
      this.#renderEmpty("No review notes are waiting.");
      return;
    }

    const preferredDraftId = preserveDraftId ?? this.currentNote?.draftNoteId;

    if (preferredDraftId) {
      const nextIndex = this.queue.findIndex((item) => item.draftNoteId === preferredDraftId);
      this.currentIndex = nextIndex >= 0 ? nextIndex : Math.min(this.currentIndex, this.queue.length - 1);
    } else {
      this.currentIndex = Math.min(this.currentIndex, this.queue.length - 1);
    }

    await this.showCurrentNote();
  }

  async showCurrentNote() {
    if (!this.queue.length) {
      this.#renderEmpty("No review notes are waiting.");
      return;
    }

    const queueItem = this.queue[this.currentIndex];
    this.#setStatus(`Loading ${queueItem.draftNoteId}...`);

    try {
      this.currentNote = await this.client.readReviewNote(queueItem.draftNoteId);
    } catch (error) {
      this.currentNote = null;
      this.#renderEmpty(error.message);
      new Notice(error.message, 6000);
      return;
    }

    this.positionEl.setText(`${this.currentIndex + 1} / ${this.queue.length}`);
    this.titleEl.setText(this.currentNote.title || "(untitled review note)");
    this.metaEl.setText(
      [
        this.currentNote.draftNoteId,
        this.currentNote.targetCorpus,
        this.currentNote.noteType,
        this.currentNote.scope,
        this.currentNote.reviewState
      ]
        .filter(Boolean)
        .join(" | ")
    );

    const warnings = this.currentNote.warnings ?? [];
    this.warningEl.setText(
      warnings.length
        ? `Warnings: ${warnings.map((warning) => warning.message).join("; ")}`
        : ""
    );

    await this.#renderMarkdown(this.currentNote.body || "");
    this.#setStatus("Review queue ready.");
    this.#updateButtonState();
  }

  async runAction(action) {
    if (!this.currentNote?.draftNoteId) {
      return;
    }

    const draftNoteId = this.currentNote.draftNoteId;
    const label = action === "accept" ? "Accepting" : "Rejecting";
    this.#setStatus(`${label} ${draftNoteId}...`);
    this.#setButtonsDisabled(true);

    try {
      const result =
        action === "accept"
          ? await this.client.acceptNote(draftNoteId)
          : await this.client.rejectNote(draftNoteId);
      this.#renderActionResult(action, result);
      await this.reloadQueue();
    } catch (error) {
      this.#setStatus(error.message);
      this.#setButtonsDisabled(false);
      new Notice(error.message, 6000);
    }
  }

  #renderActionResult(action, result) {
    const steps = Array.isArray(result.steps)
      ? result.steps.map((step) => `${step.step}: ${step.status}`).join(" | ")
      : "";

    if (action === "accept") {
      const canonicalPath = result.canonicalPath ? ` Canonical: ${result.canonicalPath}.` : "";
      this.#setStatus(`Accepted.${canonicalPath}${steps ? ` ${steps}` : ""}`);
      return;
    }

    const archivedPath = result.archivedPath ? ` Archived: ${result.archivedPath}.` : "";
    this.#setStatus(`Rejected.${archivedPath}${steps ? ` ${steps}` : ""}`);
  }

  #buildShell() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("mab-review-view");

    const header = contentEl.createDiv({ cls: "mab-review-header" });
    const titleRow = header.createDiv({ cls: "mab-review-title-row" });
    titleRow.createEl("h2", { text: "Governed Note Review" });
    this.positionEl = titleRow.createDiv({ cls: "mab-review-position", text: "0 / 0" });

    this.titleEl = header.createEl("h3", { cls: "mab-review-note-title", text: "" });
    this.metaEl = header.createDiv({ cls: "mab-review-meta", text: "" });
    this.warningEl = header.createDiv({ cls: "mab-review-warning", text: "" });

    this.bodyEl = contentEl.createDiv({ cls: "mab-review-body markdown-preview-view" });

    const actions = contentEl.createDiv({ cls: "mab-review-actions" });
    this.previousButton = actions.createEl("button", { text: "Previous" });
    this.nextButton = actions.createEl("button", { text: "Next" });
    this.refreshButton = actions.createEl("button", { text: "Refresh" });
    this.acceptButton = actions.createEl("button", { text: "Accept" });
    this.rejectButton = actions.createEl("button", { text: "Reject" });
    this.statusEl = contentEl.createDiv({ cls: "mab-review-status", text: "Ready" });

    this.previousButton.addEventListener("click", async () => {
      if (this.currentIndex > 0) {
        this.currentIndex -= 1;
        await this.showCurrentNote();
      }
    });
    this.nextButton.addEventListener("click", async () => {
      if (this.currentIndex < this.queue.length - 1) {
        this.currentIndex += 1;
        await this.showCurrentNote();
      }
    });
    this.refreshButton.addEventListener("click", async () => {
      await this.reloadQueue();
    });
    this.acceptButton.addEventListener("click", async () => {
      await this.runAction("accept");
    });
    this.rejectButton.addEventListener("click", async () => {
      await this.runAction("reject");
    });

    this.#updateButtonState();
  }

  async #renderMarkdown(markdown) {
    this.bodyEl.empty();
    if (!markdown) {
      this.bodyEl.setText("No note body.");
      return;
    }

    if (typeof MarkdownRenderer.renderMarkdown === "function") {
      await MarkdownRenderer.renderMarkdown(markdown, this.bodyEl, "", this.plugin);
      return;
    }

    if (typeof MarkdownRenderer.render === "function") {
      await MarkdownRenderer.render(this.app, markdown, this.bodyEl, "", this.plugin);
      return;
    }

    this.bodyEl.createEl("pre", { text: markdown });
  }

  #renderEmpty(message) {
    this.positionEl?.setText("0 / 0");
    this.titleEl?.setText("No review notes");
    this.metaEl?.setText("");
    this.warningEl?.setText("");
    if (this.bodyEl) {
      this.bodyEl.empty();
      this.bodyEl.setText(message);
    }
    this.#setStatus(message);
    this.#updateButtonState();
  }

  #setStatus(message) {
    if (this.statusEl) {
      this.statusEl.setText(message);
    }
  }

  #setButtonsDisabled(disabled) {
    const nextDisabled = disabled || !this.queue.length || this.currentIndex >= this.queue.length - 1;
    const previousDisabled = disabled || !this.queue.length || this.currentIndex <= 0;
    const actionDisabled = disabled || !this.currentNote;

    if (this.previousButton) {
      this.previousButton.disabled = previousDisabled;
    }
    if (this.nextButton) {
      this.nextButton.disabled = nextDisabled;
    }
    if (this.refreshButton) {
      this.refreshButton.disabled = disabled;
    }
    if (this.acceptButton) {
      this.acceptButton.disabled = actionDisabled;
    }
    if (this.rejectButton) {
      this.rejectButton.disabled = actionDisabled;
    }
  }

  #updateButtonState() {
    this.#setButtonsDisabled(false);
  }
}

class ReviewSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Multi-Agent-Brain Review Queue" });

    new Setting(containerEl)
      .setName("Repo root")
      .setDesc("Path to the Multi-Agent-Brain repository that contains apps/brain-cli/dist/main.js. This must be set before the review queue can load.")
      .addText((text) =>
        text
          .setPlaceholder("Path to your local multi-agent-brain repo")
          .setValue(this.plugin.settings.repoRoot)
          .onChange(async (value) => {
            this.plugin.settings.repoRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Node executable")
      .setDesc("Executable used to run brain-cli. Leave as node unless you need a custom path.")
      .addText((text) =>
        text
          .setPlaceholder("node")
          .setValue(this.plugin.settings.nodeExecutable)
          .onChange(async (value) => {
            this.plugin.settings.nodeExecutable = value.trim() || "node";
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = class MultiAgentBrainReviewPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new ReviewQueueView(leaf, this));

    this.addRibbonIcon("clipboard-list", "Open Multi-Agent-Brain review queue", async () => {
      await this.activateReviewView();
    });

    this.addCommand({
      id: "open-mab-review-queue",
      name: "Open Multi-Agent-Brain review queue",
      callback: async () => {
        await this.activateReviewView();
      }
    });

    this.addCommand({
      id: "refresh-mab-review-queue",
      name: "Refresh Multi-Agent-Brain review queue",
      callback: async () => {
        const view = this.getOpenReviewView();
        if (view) {
          await view.reloadQueue();
          new Notice("Review queue refreshed.", 2500);
          return;
        }

        await this.activateReviewView();
      }
    });

    this.addSettingTab(new ReviewSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateReviewView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
    }

    await leaf.setViewState({
      type: VIEW_TYPE,
      active: true
    });
    this.app.workspace.revealLeaf(leaf);
  }

  getOpenReviewView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    return leaf?.view instanceof ReviewQueueView ? leaf.view : null;
  }
};
