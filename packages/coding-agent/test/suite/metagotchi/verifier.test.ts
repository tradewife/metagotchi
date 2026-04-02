/**
 * Tests for Layer 3: Verifier.
 */

import { describe, expect, it } from "vitest";
import { SolutionVerifier } from "../../../src/metagotchi/layers/verifier.js";
import type { ProblemSpec } from "../../../src/metagotchi/types.js";

function makeProblem(overrides: Partial<ProblemSpec> = {}): ProblemSpec {
	return {
		id: "test-1",
		title: "Sum Problem",
		statement: "Read two integers and print their sum.",
		constraints: "1 ≤ a, b ≤ 10^9",
		examples: [
			{ input: "3 5", output: "8" },
			{ input: "10 20", output: "30" },
		],
		timeLimit: 1000,
		memoryLimit: 256,
		language: "cpp",
		...overrides,
	};
}

const CORRECT_CPP = `#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int a, b;
    cin >> a >> b;
    cout << a + b << '\\n';
    return 0;
}`;

const WRONG_CPP = `#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int a, b;
    cin >> a >> b;
    cout << a - b << '\\n';
    return 0;
}`;

const MALFORMED_CPP = `#include <bits/stdc++.h>
int main() {
    cout << "missing semicolon"
    return 0;
}`;

const OVERFLOW_CPP = `#include <bits/stdc++.h>
using namespace std;
int main() {
    int a = 100000;
    int b = 100000;
    int ans = a * b;
    cout << ans << '\\n';
    return 0;
}`;

const CORRECT_PYTHON = `import sys
input = sys.stdin.readline
a, b = map(int, input().split())
print(a + b)`;

const SLOW_PYTHON = `a, b = map(int, input().split())
print(a + b)`;

const CE_PYTHON = `def main(
    # missing closing paren
print("broken")`;

describe("SolutionVerifier", () => {
	it("detects AC for correct C++ solution", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "cpp" });

		const result = await verifier.verify(CORRECT_CPP, problem, "cpp");

		expect(result.compilesOrParses).toBe(true);
		expect(result.sampleCasesPassed).toBe(true);
		expect(result.verdict).toBe("AC");
	}, 30000);

	it("detects WA for wrong C++ solution", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "cpp" });

		const result = await verifier.verify(WRONG_CPP, problem, "cpp");

		expect(result.compilesOrParses).toBe(true);
		expect(result.sampleCasesPassed).toBe(false);
		expect(result.verdict).toBe("WA");
		expect(result.sampleCaseDetails[0].pass).toBe(false);
	}, 30000);

	it("detects CE for malformed C++ solution", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "cpp" });

		const result = await verifier.verify(MALFORMED_CPP, problem, "cpp");

		expect(result.compilesOrParses).toBe(false);
		expect(result.verdict).toBe("CE");
	}, 30000);

	it("detects int overflow in static analysis", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "cpp", examples: [{ input: "3 5", output: "8" }] });

		const result = await verifier.verify(OVERFLOW_CPP, problem, "cpp");

		expect(result.compilesOrParses).toBe(true);
		expect(result.staticAnalysisWarnings.some((w) => w.includes("OVERFLOW"))).toBe(true);
	}, 30000);

	it("detects AC for correct Python solution", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "python" });

		const result = await verifier.verify(CORRECT_PYTHON, problem, "python");

		expect(result.compilesOrParses).toBe(true);
		expect(result.sampleCasesPassed).toBe(true);
		expect(result.verdict).toBe("AC");
	}, 30000);

	it("warns about slow Python input()", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "python" });

		const result = await verifier.verify(SLOW_PYTHON, problem, "python");

		expect(result.staticAnalysisWarnings.some((w) => w.includes("input()"))).toBe(true);
	}, 30000);

	it("detects CE for malformed Python solution", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "python" });

		const result = await verifier.verify(CE_PYTHON, problem, "python");

		expect(result.compilesOrParses).toBe(false);
		expect(result.verdict).toBe("CE");
	}, 30000);

	it("reports sample case details", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ language: "cpp" });

		const result = await verifier.verify(WRONG_CPP, problem, "cpp");

		expect(result.sampleCaseDetails.length).toBe(2);
		expect(result.sampleCaseDetails[0].input).toBe("3 5");
		expect(result.sampleCaseDetails[0].expected).toBe("8");
	}, 30000);

	it("handles problems with no examples", async () => {
		const verifier = new SolutionVerifier();
		const problem = makeProblem({ examples: [] });

		const result = await verifier.verify(CORRECT_CPP, problem, "cpp");

		expect(result.compilesOrParses).toBe(true);
		expect(result.sampleCasesPassed).toBe(true);
		expect(result.sampleCaseDetails.length).toBe(0);
	}, 30000);

	it("strips trailing whitespace for comparison", async () => {
		const verifier = new SolutionVerifier();
		const solution = `#include <bits/stdc++.h>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`;
		const problem = makeProblem({
			examples: [{ input: "1 2", output: "3  " }], // trailing spaces in expected
			language: "cpp",
		});

		const result = await verifier.verify(solution, problem, "cpp");
		expect(result.sampleCasesPassed).toBe(true);
	}, 30000);
});
