import { compile } from "./compile";
import { cp, mkdtemp, readdir, stat, writeFile } from "fs/promises";
import { describe, test, expect } from "vitest";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { Target } from "./constants";

const exampleDir = resolve("../../examples/tests/valid");

/**
 * Creates a clean environment for each test by copying the example file to a temporary directory.
 */
export async function tmpTestFile(source: string, ...additionalFiles: string[]) {
  const testDir = await mkdtemp(join(tmpdir(), "-wing-compile-test"));
  const exampleWingFile = join(testDir, source);
  await cp(join(exampleDir, source), exampleWingFile);
  for (const file of additionalFiles) {
    await cp(join(exampleDir, file), join(testDir, file));
  }

  return exampleWingFile;
}

describe(
  "compile command tests",
  () => {
    test("should be able to compile the SDK capture test to tf-aws", async () => {
      const exampleWingFile = await tmpTestFile("captures.w");

      const artifactDir = await compile(exampleWingFile, {
        target: Target.TF_AWS,
      });

      const stats = await stat(artifactDir);
      expect(stats.isDirectory()).toBeTruthy();
      const files = await readdir(artifactDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain("main.tf.json");
      expect(files).toContain("tree.json");
    });

    test("should be able to compile the SDK capture test to sim", async () => {
      const exampleWingFile = await tmpTestFile("captures.w");

      const outDir = await compile(exampleWingFile, {
        target: Target.SIM,
      });

      const stats = await stat(outDir);
      expect(stats.isDirectory()).toBeTruthy();
      const files = (await readdir(outDir)).sort();
      expect(files.length).toBeGreaterThan(0);
      expect(files).toEqual([".wing", "simulator.json", "tree.json"]);
    });

    test("should error if a nonexistent file is compiled", async () => {
      return expect(compile("non-existent-file.w", { target: Target.SIM })).rejects.toThrowError(
        /Source file cannot be found/
      );
    });

    // https://github.com/winglang/wing/issues/2081
    test("should be able to compile extern file from same directory", async () => {
      // temporarily change cwd to the example directory
      const oldCwd = process.cwd();
      try {
        process.chdir(exampleDir);

        // because we changed to the example directory, we can just pass the filename
        const outDir = await compile("extern_implementation.w", {
          target: Target.SIM,
        });

        const stats = await stat(outDir);
        expect(stats.isDirectory()).toBeTruthy();
        const files = (await readdir(outDir)).sort();
        expect(files.length).toBeGreaterThan(0);
        expect(files).toEqual([".wing", "simulator.json", "tree.json"]);
      } finally {
        process.chdir(oldCwd);
      }
    });

    test("should not delete files in the output directory if they are not generated by the compiler", async () => {
      const exampleWingFile = await tmpTestFile("captures.w");
      const artifactDir = await compile(exampleWingFile, { target: Target.TF_AWS });

      const files = await readdir(artifactDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain("main.tf.json");
      expect(files).toContain("tree.json");
      expect(files).not.toContain("terraform.tfstate");

      // create a file in the output directory
      const extraFile = join(artifactDir, "terraform.tfstate");
      await writeFile(extraFile, "hello world");

      // recompile
      const artifactDir2 = await compile(exampleWingFile, { target: Target.TF_AWS });
      expect(artifactDir2).toBe(artifactDir);

      const files2 = await readdir(artifactDir2);
      expect(files2.length).toBeGreaterThan(0);
      expect(files2).toContain("main.tf.json");
      expect(files2).toContain("tree.json");
      expect(files2).toContain("terraform.tfstate"); // file was not deleted
    });
  },
  { timeout: 1000 * 60 * 5 }
);
