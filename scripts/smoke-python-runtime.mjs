import {
  isCurrentHostTarget,
  parseArgs,
  resolveTargetFromBuilderArgs,
  smokeBundledPythonRuntime,
} from "./python-runtime.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = typeof args.target === "string" && args.target.trim()
    ? args.target.trim()
    : resolveTargetFromBuilderArgs(process.argv.slice(2));
  if (!isCurrentHostTarget(target)) {
    throw new Error(
      `Cannot smoke bundled Python runtime for non-host target ${target}; `
      + "use ensure-python-runtime.mjs for cross-target preparation.",
    );
  }
  const executable = await smokeBundledPythonRuntime(target);
  console.log(JSON.stringify({ target, executable, state: "ok" }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
