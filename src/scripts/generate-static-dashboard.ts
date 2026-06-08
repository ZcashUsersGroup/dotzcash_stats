import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

async function main(): Promise<void> {
  const publicDir = resolve(process.cwd(), "public");
  await mkdir(publicDir, { recursive: true });
  await rm(resolve(publicDir, "index.html"), { force: true });
  await rm(resolve(publicDir, "dashboard"), { recursive: true, force: true });
}

main().catch((error) => {
  console.error("[generate-static-dashboard] failed:", error);
  process.exitCode = 1;
});
