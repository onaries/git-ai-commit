import { Command } from "commander";
import readline from "readline";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { GitService, GitDiffResult } from "./git";
import { AIService, AIServiceConfig } from "./ai";
import { ConfigService } from "./config";
import { LogService } from "./log";

export interface CommitOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  push?: boolean;
  messageOnly?: boolean;
  prompt?: string;
  verify?: boolean;
}

export class CommitCommand {
  private program: Command;

  constructor() {
    this.program = new Command("commit")
      .description("Generate AI-powered commit message")
      .option("-k, --api-key <key>", "OpenAI API key (overrides env var)")
      .option("-b, --base-url <url>", "Custom API base URL (overrides env var)")
      .option("--model <model>", "Model to use (overrides env var)")
      .option(
        "-m, --message-only",
        "Output only the generated commit message and skip git actions"
      )
      .option(
        "-p, --push",
        "Push current branch after creating the commit (implies --commit)"
      )
      .option(
        "--prompt <text>",
        "Additional instructions to append to the AI prompt for this commit"
      )
      .option(
        "--no-verify",
        "Skip pre-commit hooks"
      )
      .action(this.handleCommit.bind(this));
  }

  private async runPreCommitHook(): Promise<void> {
    // 1. Check for npm pre-commit script
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const raw = fs.readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(raw);

        if (pkg.scripts && pkg.scripts["pre-commit"]) {
          console.log("Running npm pre-commit script...");

          await new Promise<void>((resolve, reject) => {
            const child = spawn("npm", ["run", "pre-commit"], {
              stdio: "inherit",
              shell: true,
            });

            child.on("close", (code) => {
              if (code === 0) {
                console.log("✅ npm pre-commit script passed");
                resolve();
              } else {
                console.error(`❌ npm pre-commit script failed with code ${code}`);
                reject(new Error(`npm pre-commit script failed with code ${code}`));
              }
            });

            child.on("error", (err) => {
              reject(err);
            });
          });
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
      }
    }

    // 2. Check for .pre-commit-config.yaml (Python/General pre-commit)
    const preCommitConfigPath = path.resolve(process.cwd(), ".pre-commit-config.yaml");
    if (fs.existsSync(preCommitConfigPath)) {
      console.log("Found .pre-commit-config.yaml, running pre-commit hooks...");
      
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("pre-commit", ["run"], {
            stdio: "inherit",
            shell: true,
          });

          child.on("close", (code) => {
            if (code === 0) {
              console.log("✅ pre-commit hooks passed");
              resolve();
            } else {
              console.error(`❌ pre-commit hooks failed with code ${code}`);
              reject(new Error(`pre-commit hooks failed with code ${code}`));
            }
          });

          child.on("error", (err) => {
            // If pre-commit is not installed/found, we might want to warn instead of fail?
            // But usually 'error' event on spawn (with shell:true) is rare for command not found (it usually exits with 127).
            // However, if it fails to spawn, we reject.
            reject(err);
          });
        });
      } catch (error) {
        // If the error suggests command not found, we might warn.
        // But since we use shell:true, 'command not found' usually results in exit code 127, which goes to 'close' event.
        // So we catch the error from the promise rejection above.
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("code 127") || msg.includes("ENOENT")) {
           console.warn("⚠️ 'pre-commit' command not found, skipping hooks despite configuration file presence.");
           return;
        }
        throw error;
      }
    }
  }

  private async handleCommit(options: CommitOptions) {
    const start = Date.now();
    const safeArgs = {
      ...options,
      apiKey: options.apiKey ? "***" : undefined,
    } as Record<string, unknown>;
    try {
      if (options.verify !== false) {
        await this.runPreCommitHook();
      }

      const existingConfig = ConfigService.getConfig();

      const mergedApiKey = options.apiKey || existingConfig.apiKey;
      const mergedBaseURL = options.baseURL || existingConfig.baseURL;
      const mergedModel = options.model || existingConfig.model;
      const messageOnly = Boolean(options.messageOnly);

      const log = (...args: unknown[]) => {
        if (!messageOnly) {
          console.log(...args);
        }
      };

      ConfigService.validateConfig({
        apiKey: mergedApiKey,
        language: existingConfig.language,
      });

      const aiConfig: AIServiceConfig = {
        apiKey: mergedApiKey!,
        baseURL: mergedBaseURL,
        model: mergedModel,
        fallbackModel: existingConfig.fallbackModel,
        language: existingConfig.language,
        verbose: !messageOnly,
      };

      log("Getting staged changes...");

      const diffResult: GitDiffResult = await GitService.getStagedDiff();

      if (!diffResult.success) {
        console.error("Error:", diffResult.error);
        await LogService.append({
          command: "commit",
          args: safeArgs,
          status: "failure",
          details: diffResult.error,
          durationMs: Date.now() - start,
          model: mergedModel,
        });
        process.exit(1);
      }

      log("Generating commit message...");

      const aiService = new AIService(aiConfig);
      const aiResult = await aiService.generateCommitMessage(
        diffResult.diff!,
        options.prompt
      );

      if (!aiResult.success) {
        console.error("Error:", aiResult.error);
        await LogService.append({
          command: "commit",
          args: safeArgs,
          status: "failure",
          details: aiResult.error,
          durationMs: Date.now() - start,
          model: mergedModel,
        });
        process.exit(1);
      }

      if (typeof aiResult.message !== "string") {
        console.error("Error: Failed to generate commit message");
        process.exit(1);
      }

      if (messageOnly) {
        console.log(aiResult.message);
        await LogService.append({
          command: "commit",
          args: { ...safeArgs, messageOnly: true },
          status: "success",
          details: "message-only output",
          durationMs: Date.now() - start,
          model: mergedModel,
        });
        return;
      }

      console.log("\nGenerated commit message:");
      console.log(aiResult.message);

      const confirmed = await this.confirmCommit();

      if (!confirmed) {
        console.log("Commit cancelled by user.");
        await LogService.append({
          command: "commit",
          args: safeArgs,
          status: "cancelled",
          details: "user declined commit",
          durationMs: Date.now() - start,
          model: mergedModel,
        });
        return;
      }

      console.log("\nCreating commit...");
      const commitSuccess = await GitService.createCommit(aiResult.message!);

      if (commitSuccess) {
        console.log("✅ Commit created successfully!");

        const pushRequested = Boolean(options.push);
        const pushFromConfig = !pushRequested && existingConfig.autoPush;
        const shouldPush = pushRequested || pushFromConfig;

        if (shouldPush) {
          if (pushFromConfig) {
            console.log("Auto push enabled in config; pushing to remote...");
          } else {
            console.log("Pushing to remote...");
          }

          const pushSuccess = await GitService.push();

          if (pushSuccess) {
            console.log("✅ Push completed successfully!");
          } else {
            console.error("❌ Failed to push to remote");
            await LogService.append({
              command: "commit",
              args: { ...safeArgs, push: true },
              status: "failure",
              details: "push failed",
              durationMs: Date.now() - start,
              model: mergedModel,
            });
            process.exit(1);
          }
        }
      } else {
        console.error("❌ Failed to create commit");
        await LogService.append({
          command: "commit",
          args: safeArgs,
          status: "failure",
          details: "git commit failed",
          durationMs: Date.now() - start,
          model: mergedModel,
        });
        process.exit(1);
      }
      await LogService.append({
        command: "commit",
        args: safeArgs,
        status: "success",
        durationMs: Date.now() - start,
        model: mergedModel,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error:", message);
      await LogService.append({
        command: "commit",
        args: safeArgs,
        status: "failure",
        details: message,
        durationMs: Date.now() - start,
        model: options.model,
      });
      process.exit(1);
    }
  }

  private async confirmCommit(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer: string = await new Promise((resolve) => {
      rl.question("Proceed with git commit? (y/n): ", resolve);
    });

    rl.close();

    const normalized = answer.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
  }

  getCommand(): Command {
    return this.program;
  }
}
