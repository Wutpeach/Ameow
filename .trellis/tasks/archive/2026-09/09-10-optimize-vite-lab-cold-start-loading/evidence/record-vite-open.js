import { appendFile } from "node:fs/promises";

if (!process.env.LAB_OPEN_RECORD) throw new Error("LAB_OPEN_RECORD is required.");
await appendFile(process.env.LAB_OPEN_RECORD, `${process.argv.at(-1)}\n`);
