import {
  ensureOfficialBundledPythonRuntime,
  parseArgs,
  resolveRuntimeTarget,
  resolveTargetFromBuilderArgs,
} from "./python-runtime.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = typeof args.target === "string" && args.target.trim()
    ? args.target.trim()
    : resolveTargetFromBuilderArgs(process.argv.slice(2));
  const force = args.force === "true";
  const result = await ensureOfficialBundledPythonRuntime(target, { force });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
