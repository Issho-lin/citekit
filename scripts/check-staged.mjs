#!/usr/bin/env node
/**
 * pre-commit 检查：按暂存文件范围决定跑哪些检查，避免每次提交全量等待。
 * 退出码非 0 即拦截提交。绕过方式：git commit --no-verify（紧急情况才用）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function stagedFiles() {
  const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

function run(cmd, args, opts = {}) {
  const label = opts.label ?? cmd;
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
    console.log(`✓ ${label} 通过`);
    return true;
  } catch {
    console.error(`✗ ${label} 失败：请修复后再提交（或 --no-verify 绕过）`);
    return false;
  }
}

const staged = stagedFiles();
const touchWeb = staged.some((f) => f.startsWith("web/"));
const touchServer = staged.some((f) => f.startsWith("server/"));

let ok = true;
if (touchWeb) {
  if (!existsSync("web/node_modules")) {
    console.error("✗ web/node_modules 不存在，请先 pnpm install");
    process.exit(1);
  }
  // tsc 增量检查：只看改动文件，但共享类型被改坏时也能查出引用方
  ok = run("pnpm", ["--dir", "web", "exec", "tsc", "--noEmit"], { label: "web tsc --noEmit" }) && ok;
}
if (touchServer) {
  if (!existsSync("server/.venv")) {
    console.error("✗ server/.venv 不存在，请先 uv --directory server sync");
    process.exit(1);
  }
  ok = run("uv", ["--directory", "server", "run", "python", "-m", "unittest", "discover", "tests"], {
    label: "server unittest",
  }) && ok;
}
process.exit(ok ? 0 : 1);
