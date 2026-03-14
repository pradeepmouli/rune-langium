import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname, join, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { KNOWN_GENERATORS } from '@rune-langium/codegen';
import type { CodeGenerationResult, GeneratedFile, GenerationError } from '@rune-langium/codegen';

export interface GenerateCommandOptions {
  language: string;
  input: string[];
  output: string;
  reference?: string[];
  codegenJar?: string;
  generatorOpts?: string;
  listLanguages?: boolean;
  json?: boolean;
}

/**
 * List available code generators.
 */
export function listLanguages(options: { json?: boolean }): number {
  if (options.json) {
    console.log(JSON.stringify(KNOWN_GENERATORS, null, 2));
  } else {
    console.log('Available code generators:');
    console.log();
    for (const gen of KNOWN_GENERATORS) {
      console.log(`  ${gen.id.padEnd(14)} ${gen.label}`);
    }
    console.log();
    console.log('Note: Requires rosetta-code-generators JAR and Java 21+ runtime.');
  }
  return 0;
}

/**
 * Discover `.rosetta` files from a list of file/directory paths.
 */
async function discoverFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const p of paths) {
    const resolved = resolve(p);
    const s = await stat(resolved);
    if (s.isDirectory()) {
      const entries = await readdir(resolved, { recursive: true });
      for (const entry of entries) {
        if (extname(entry) === '.rosetta') {
          files.push(resolve(resolved, entry));
        }
      }
    } else if (extname(resolved) === '.rosetta') {
      files.push(resolved);
    }
  }
  return files;
}

/**
 * Resolve the path to the code generation JAR.
 * Priority: --codegen-jar flag > RUNE_CODEGEN_JAR env var.
 */
function resolveCodegenJar(options: GenerateCommandOptions): string | undefined {
  return options.codegenJar ?? process.env['RUNE_CODEGEN_JAR'];
}

/**
 * Copy .rosetta files into a temporary directory structure for the Java codegen.
 */
async function prepareInputDirectory(
  userFiles: string[],
  referenceFiles: string[]
): Promise<{ inputDir: string; userFilePaths: string[] }> {
  const inputDir = join(tmpdir(), `rune-codegen-${Date.now()}`);
  const userDir = join(inputDir, 'user');
  const refDir = join(inputDir, 'reference');

  await mkdir(userDir, { recursive: true });
  await mkdir(refDir, { recursive: true });

  const userFilePaths: string[] = [];

  for (const file of userFiles) {
    const name = basename(file);
    const dest = join(userDir, name);
    const content = await readFile(file, 'utf-8');
    await writeFile(dest, content, 'utf-8');
    userFilePaths.push(relative(inputDir, dest));
  }

  for (const file of referenceFiles) {
    const name = basename(file);
    const dest = join(refDir, name);
    const content = await readFile(file, 'utf-8');
    await writeFile(dest, content, 'utf-8');
  }

  return { inputDir, userFilePaths };
}

/**
 * Invoke the Java code generator via subprocess.
 */
function invokeCodegen(
  jarPath: string,
  language: string,
  inputDir: string,
  outputDir: string,
  generatorOpts?: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const args = [
      '-jar',
      jarPath,
      '--language',
      language,
      '--input',
      inputDir,
      '--output',
      outputDir
    ];

    if (generatorOpts) {
      args.push('--generator-opts', generatorOpts);
    }

    const child = spawn('java', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on('error', (err) => {
      resolve({ exitCode: 2, stdout: '', stderr: `Failed to spawn java process: ${err.message}` });
    });
  });
}

/**
 * Collect generated output files from the output directory.
 */
async function collectOutputFiles(outputDir: string): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];

  try {
    const entries = await readdir(outputDir, { recursive: true });
    for (const entry of entries) {
      const fullPath = resolve(outputDir, entry);
      const s = await stat(fullPath);
      if (s.isFile()) {
        const content = await readFile(fullPath, 'utf-8');
        files.push({
          path: entry,
          content
        });
      }
    }
  } catch {
    // Output directory may not exist if generation failed
  }

  return files;
}

/**
 * Parse error output from the Java codegen process.
 */
function parseErrors(stderr: string): GenerationError[] {
  const errors: GenerationError[] = [];
  const lines = stderr.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    // Try to parse structured error format: "file.rosetta:construct: message"
    const match = line.match(/^(.+?\.rosetta):(.+?):\s*(.+)$/);
    if (match) {
      errors.push({
        sourceFile: match[1]!,
        construct: match[2]!,
        message: match[3]!
      });
    } else if (line.startsWith('ERROR') || line.startsWith('error')) {
      errors.push({
        sourceFile: '',
        construct: '',
        message: line
      });
    }
  }

  return errors;
}

/**
 * Run the code generation command.
 */
export async function runGenerate(options: GenerateCommandOptions): Promise<number> {
  // Handle --list-languages
  if (options.listLanguages) {
    return listLanguages({ json: options.json });
  }

  // Validate language
  if (!options.language) {
    console.error('Error: --language is required. Use --list-languages to see available options.');
    return 2;
  }

  // Validate input
  if (!options.input || options.input.length === 0) {
    console.error('Error: --input is required. Specify .rosetta files or directories.');
    return 2;
  }

  // Validate output
  if (!options.output) {
    console.error('Error: --output is required. Specify the output directory.');
    return 2;
  }

  // Resolve codegen JAR
  const jarPath = resolveCodegenJar(options);
  if (!jarPath) {
    console.error(
      'Error: Code generation JAR not found. Set RUNE_CODEGEN_JAR environment variable or use --codegen-jar flag.'
    );
    console.error('The JAR must be built from https://github.com/REGnosys/rosetta-code-generators');
    return 2;
  }

  // Discover user files
  const userFiles = await discoverFiles(options.input);
  if (userFiles.length === 0) {
    console.error('No .rosetta files found in the specified input paths.');
    return 2;
  }

  // Discover reference files (compilation context, not exported)
  const referenceFiles = options.reference ? await discoverFiles(options.reference) : [];

  if (!options.json) {
    console.log(
      `Generating ${options.language} code from ${userFiles.length} file(s)` +
        (referenceFiles.length > 0 ? ` with ${referenceFiles.length} reference file(s)` : '') +
        '...'
    );
  }

  // Prepare input directory
  const { inputDir, userFilePaths } = await prepareInputDirectory(userFiles, referenceFiles);

  // Ensure output directory exists
  const outputDir = resolve(options.output);
  await mkdir(outputDir, { recursive: true });

  // Invoke codegen
  const result = await invokeCodegen(
    jarPath,
    options.language,
    inputDir,
    outputDir,
    options.generatorOpts
  );

  // Collect output files
  const generatedFiles = await collectOutputFiles(outputDir);

  // Parse errors
  const errors = result.exitCode !== 0 ? parseErrors(result.stderr) : [];

  // Extract warnings from stdout
  const warnings = result.stdout
    .split('\n')
    .filter((l) => l.startsWith('WARN') || l.startsWith('warning'))
    .map((l) => l.trim());

  const codegenResult: CodeGenerationResult = {
    language: options.language,
    files: generatedFiles,
    errors,
    warnings
  };

  if (options.json) {
    // JSON output: include file paths and sizes (not full content for CLI)
    const jsonOutput = {
      language: codegenResult.language,
      files: codegenResult.files.map((f) => ({
        path: f.path,
        size: f.content.length
      })),
      errors: codegenResult.errors,
      warnings: codegenResult.warnings,
      userFiles: userFilePaths
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    if (errors.length > 0) {
      console.error(`\nCode generation completed with ${errors.length} error(s):`);
      for (const err of errors) {
        const location = [err.sourceFile, err.construct].filter(Boolean).join(':');
        console.error(`  ${location ? `${location}: ` : ''}${err.message}`);
      }
    }

    if (warnings.length > 0) {
      console.warn(`\n${warnings.length} warning(s):`);
      for (const w of warnings) {
        console.warn(`  ${w}`);
      }
    }

    if (generatedFiles.length > 0) {
      console.log(`\nGenerated ${generatedFiles.length} file(s) in ${outputDir}`);
      for (const f of generatedFiles) {
        console.log(`  ${f.path}`);
      }
    } else if (errors.length === 0) {
      console.log('\nNo files generated.');
    }
  }

  return result.exitCode === 0 ? 0 : 1;
}
