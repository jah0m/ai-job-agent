import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "../src/cli.ts");

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runCLI(args: string[]): Promise<CLIResult> {
  const proc = spawn(process.execPath, ["--import", "tsx", CLI_PATH, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!proc.stdout || !proc.stderr) throw new Error("CLI process pipes were not created");

  const read = (stream: NodeJS.ReadableStream): Promise<string> =>
    new Promise((resolve, reject) => {
      let output = "";
      stream.on("data", (chunk: Buffer | string) => {
        output += chunk.toString();
      });
      stream.on("end", () => resolve(output));
      stream.on("error", reject);
    });
  const exit = new Promise<number>((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code) => resolve(code ?? 1));
  });
  const [stdout, stderr, exitCode] = await Promise.all([read(proc.stdout), read(proc.stderr), exit]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export function parseJSON<T = unknown>(result: CLIResult): T {
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI exited with code ${result.exitCode}. stderr: ${result.stderr}`
    );
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(
      `Failed to parse JSON. stdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
}
