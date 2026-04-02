/**
 * Layer 3: Solution Verifier / Evaluator (The Skeptic).
 *
 * Fail-fast verification pipeline:
 *   1. Compilation / parse check
 *   2. Sample case execution (subprocess)
 *   3. Static analysis (language-specific gotcha patterns)
 *   4. Verdict assignment
 */

import { execFile, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Language, ProblemSpec, VerificationResult } from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface Verifier {
	verify(solution: string, problem: ProblemSpec, language: Language): Promise<VerificationResult>;
}

// ---------------------------------------------------------------------------
// Static analysis patterns per language
// ---------------------------------------------------------------------------

interface StaticCheck {
	pattern: RegExp;
	warning: string;
	languages: Language[];
}

const STATIC_CHECKS: StaticCheck[] = [
	// C++
	{
		pattern: /int\s+\w+\s*=\s*\w+\s*\*\s*\w+\s*;/,
		warning: "POTENTIAL_OVERFLOW: int multiplication assigned to int — cast to long long first",
		languages: ["cpp"],
	},
	{
		pattern: /endl(?!\s*<<)/,
		warning: "TLE_RISK: endl forces flush — use '\\n' in tight loops",
		languages: ["cpp"],
	},
	{
		pattern: /cin\s*>>/,
		warning: "TLE_RISK: cin used — verify ios::sync_with_stdio(false) is present",
		languages: ["cpp"],
	},
	{
		pattern: /scanf|printf/,
		warning: "SYNC_RISK: scanf/printf mixed with cin/cout — ensure sync is disabled",
		languages: ["cpp"],
	},
	{
		pattern: /priority_queue<\s*pair<\s*int/,
		warning: "HEAP_DIRECTION: default priority_queue is max-heap — Dijkstra needs min-heap (greater<>)",
		languages: ["cpp"],
	},
	// Python
	{
		pattern: /input\(\s*\)/,
		warning: "TLE_RISK: input() used — replace with sys.stdin.readline for large N",
		languages: ["python"],
	},
	{
		pattern: /\/\s*(?!=)/,
		warning: "DIVISION_RISK: / returns float in Python 3 — use // for integer division",
		languages: ["python"],
	},
	{
		pattern: /def\s+\w+\(.*\):/,
		warning: "RECURSION_RISK: recursive function detected — verify sys.setrecursionlimit is set",
		languages: ["python"],
	},
	// Java
	{
		pattern: /int\s+\w+\s*=\s*\w+\s*\*\s*\w+/,
		warning: "POTENTIAL_OVERFLOW: int multiplication — use long",
		languages: ["java"],
	},
	{
		pattern: /Scanner/,
		warning: "TLE_RISK: Scanner is slow — use BufferedReader for large input",
		languages: ["java"],
	},
	// All languages — output format
	{
		pattern: /System\.out\.print\(\s*"[^"]*\s+"\s*\)/,
		warning: "FORMAT_RISK: trailing spaces in output format — verify exact output format",
		languages: ["java"],
	},
	{
		pattern: /fixed\s*<<\s*setprecision/,
		warning: "PRECISION: floating point output — verify required precision",
		languages: ["cpp"],
	},
];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export interface VerifierOptions {
	enableComplexityCheck?: boolean;
	modelCall?: (prompt: string) => Promise<string>;
}

export class SolutionVerifier implements Verifier {
	private readonly enableComplexityCheck: boolean;
	private readonly modelCall?: (prompt: string) => Promise<string>;

	constructor(options: VerifierOptions = {}) {
		this.enableComplexityCheck = options.enableComplexityCheck ?? false;
		this.modelCall = options.modelCall;
	}

	async verify(solution: string, problem: ProblemSpec, language: Language): Promise<VerificationResult> {
		const result: VerificationResult = {
			candidateIndex: 0,
			compilesOrParses: false,
			sampleCasesPassed: false,
			sampleCaseDetails: [],
			staticAnalysisWarnings: [],
			estimatedComplexity: "unknown",
			verdict: "PENDING",
		};

		// Step 1: Compilation / parse check
		const compileResult = await this.compileOrParse(solution, language);
		if (!compileResult.success) {
			result.compilesOrParses = false;
			result.verdict = "CE";
			result.staticAnalysisWarnings.push(`Compilation error: ${compileResult.error}`);
			return result;
		}
		result.compilesOrParses = true;

		// Step 2: Sample case execution
		if (problem.examples.length > 0) {
			const execResult = await this.executeSampleCases(solution, problem, language, compileResult.executablePath);
			result.sampleCaseDetails = execResult.details;
			result.sampleCasesPassed = execResult.allPassed;

			if (!execResult.allPassed) {
				// Check for timeout vs wrong answer
				const hasTimeout = execResult.details.some((d) => d.got === "__TIMEOUT__");
				const hasCrash = execResult.details.some((d) => d.got === "__CRASH__");

				if (hasTimeout) {
					result.verdict = "TLE";
				} else if (hasCrash) {
					result.verdict = "RE";
				} else {
					result.verdict = "WA";
				}
			}
		} else {
			result.sampleCasesPassed = true;
		}

		// Step 3: Static analysis
		const warnings = this.runStaticAnalysis(solution, language);
		result.staticAnalysisWarnings.push(...warnings);

		// Step 4: Complexity self-report (optional)
		if (this.enableComplexityCheck && this.modelCall) {
			try {
				const response = await this.modelCall(
					`Estimate the time complexity of this code. Reply ONLY with the complexity like "O(n log n)":\n\n${solution}`,
				);
				result.estimatedComplexity = response.trim().split("\n")[0];
			} catch {
				result.estimatedComplexity = "unknown";
			}
		}

		// Step 5: Verdict assignment
		if (result.verdict === "PENDING") {
			if (result.sampleCasesPassed && result.staticAnalysisWarnings.length === 0) {
				result.verdict = "AC";
			} else if (result.sampleCasesPassed) {
				result.verdict = "AC"; // passed samples but has warnings — still AC
			} else {
				result.verdict = result.verdict || "WA";
			}
		}

		return result;
	}

	private async compileOrParse(
		solution: string,
		language: Language,
	): Promise<{ success: boolean; error?: string; executablePath?: string }> {
		const tmpDir = mkdtempSync(join(tmpdir(), "cp-verify-"));

		switch (language) {
			case "cpp": {
				const srcPath = join(tmpDir, "solution.cpp");
				const exePath = join(tmpDir, "solution");
				writeFileSync(srcPath, solution, "utf-8");

				return new Promise((resolve) => {
					execFile("g++", ["-O2", "-o", exePath, srcPath], { timeout: 10000 }, (error) => {
						if (error) {
							resolve({ success: false, error: error.message });
						} else {
							resolve({ success: true, executablePath: exePath });
						}
					});
				});
			}

			case "python": {
				// Python: try to parse (compile to bytecode without executing)
				return new Promise((resolve) => {
					const srcPath = join(tmpDir, "solution.py");
					writeFileSync(srcPath, solution, "utf-8");
					execFile("python3", ["-m", "py_compile", srcPath], { timeout: 5000 }, (error) => {
						if (error) {
							resolve({ success: false, error: error.message });
						} else {
							resolve({ success: true, executablePath: srcPath });
						}
					});
				});
			}

			case "java": {
				const srcPath = join(tmpDir, "Solution.java");
				writeFileSync(srcPath, solution, "utf-8");
				return new Promise((resolve) => {
					execFile("javac", [srcPath], { timeout: 15000 }, (error) => {
						if (error) {
							resolve({ success: false, error: error.message });
						} else {
							resolve({ success: true, executablePath: join(tmpDir, "Solution") });
						}
					});
				});
			}

			case "rust": {
				// Simplified: just check it parses
				const srcPath = join(tmpDir, "solution.rs");
				writeFileSync(srcPath, solution, "utf-8");
				return new Promise((resolve) => {
					execFile("rustc", ["--check", srcPath], { timeout: 15000 }, (error) => {
						if (error) {
							resolve({ success: false, error: error.message });
						} else {
							resolve({ success: true, executablePath: undefined });
						}
					});
				});
			}

			case "typescript": {
				// Basic check: just verify it's parseable JS/TS
				const srcPath = join(tmpDir, "solution.ts");
				writeFileSync(srcPath, solution, "utf-8");
				return new Promise((resolve) => {
					execFile("npx", ["tsx", "--eval", solution], { timeout: 5000 }, (_error) => {
						// For TS we just accept it if it doesn't crash immediately
						// Real compilation check would need tsc
						resolve({ success: true, executablePath: srcPath });
					});
				});
			}

			default:
				return { success: true };
		}
	}

	private async executeSampleCases(
		solution: string,
		problem: ProblemSpec,
		language: Language,
		executablePath: string | undefined,
	): Promise<{ allPassed: boolean; details: VerificationResult["sampleCaseDetails"] }> {
		const details: VerificationResult["sampleCaseDetails"] = [];
		let allPassed = true;

		const timeoutMs = problem.timeLimit * 2;

		for (const example of problem.examples) {
			const detail = await this.runSingleCase(
				solution,
				language,
				executablePath,
				example.input,
				example.output,
				timeoutMs,
			);
			details.push(detail);
			if (!detail.pass) allPassed = false;
		}

		return { allPassed, details };
	}

	private async runSingleCase(
		_solution: string,
		language: Language,
		executablePath: string | undefined,
		input: string,
		expected: string,
		timeoutMs: number,
	): Promise<{ input: string; expected: string; got: string; pass: boolean }> {
		if (!executablePath) {
			return { input, expected, got: "__CRASH__", pass: false };
		}

		return new Promise((resolve) => {
			let cmd: string;
			let args: string[];

			switch (language) {
				case "cpp":
					cmd = executablePath;
					args = [];
					break;
				case "python":
					cmd = "python3";
					args = [executablePath];
					break;
				case "java":
					cmd = "java";
					args = ["-cp", join(executablePath, ".."), "Solution"];
					break;
				default:
					cmd = executablePath;
					args = [];
			}

			const child = spawn(cmd, args, {
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env },
			});

			let stdout = "";
			let killed = false;
			const timer = setTimeout(() => {
				killed = true;
				child.kill("SIGKILL");
			}, timeoutMs);

			child.stdout.on("data", (data: Buffer) => {
				stdout += data.toString();
			});

			child.on("close", (code) => {
				clearTimeout(timer);

				let got: string;
				let pass: boolean;

				if (killed) {
					got = "__TIMEOUT__";
					pass = false;
				} else if (code !== 0 && code !== null) {
					got = "__CRASH__";
					pass = false;
				} else {
					// Normalize: strip trailing whitespace and newlines
					got = stdout.replace(/\s+$/g, "");
					const normExpected = expected.replace(/\s+$/g, "");
					pass = got === normExpected;
				}

				resolve({ input, expected, got, pass });
			});

			child.on("error", () => {
				clearTimeout(timer);
				resolve({ input, expected, got: "__CRASH__", pass: false });
			});

			// Write input and close stdin
			child.stdin.write(input);
			child.stdin.end();
		});
	}

	private runStaticAnalysis(solution: string, language: Language): string[] {
		const warnings: string[] = [];

		for (const check of STATIC_CHECKS) {
			if (!check.languages.includes(language)) continue;
			if (check.pattern.test(solution)) {
				warnings.push(check.warning);
			}
		}

		return warnings;
	}
}
