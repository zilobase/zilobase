import { spawn } from "node:child_process";

export function runCommand(command, args, options) {
  const { label = command, ...spawnOptions } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...spawnOptions,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${label} terminated by ${signal}.`
            : `${label} exited with code ${code}.`,
        ),
      );
    });
  });
}
