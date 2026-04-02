/**
 * Fast smoke test — must complete in <5 seconds.
 * Run: npx tsx src/metagotchi/scripts/validate.ts
 * Exit 0 on all pass, exit 1 on any failure.
 */
import { ProblemClassifier } from "../layers/classifier.js";
import { ProblemPrompter } from "../layers/prompter.js";
import { ProblemRetriever } from "../layers/retriever.js";
import { INITIAL_GOTCHAS } from "../skills/gotchas.js";
import { SolutionArchive } from "../store/solution-archive.js";
import type { ProblemSpec } from "../types.js";

const PASS = "✓";
const FAIL = "✗";
let allPassed = true;

function assert(condition: boolean, label: string): void {
	if (condition) {
		console.log(`${PASS} ${label}`);
	} else {
		console.error(`${FAIL} FAILED: ${label}`);
		allPassed = false;
	}
}

async function main() {
	const start = Date.now();

	// Synthetic trivial problem
	const problem: ProblemSpec = {
		id: "validate-aplusb",
		title: "A + B",
		statement: "Given two integers A and B, print A + B.",
		constraints: "1 <= A, B <= 1000",
		examples: [{ input: "1 2", output: "3" }],
		timeLimit: 1000,
		memoryLimit: 256,
		language: "cpp",
	};

	const archive = new SolutionArchive("/tmp/validate-archive");
	const classifier = new ProblemClassifier({ archive });
	const retriever = new ProblemRetriever({ archive });
	const prompter = new ProblemPrompter();

	// 1. Classifier runs without throwing
	let classifierOutput: Awaited<ReturnType<typeof classifier.classify>>;
	try {
		classifierOutput = await classifier.classify(problem);
		assert(true, "Classifier runs without throwing");
	} catch (e) {
		assert(false, `Classifier threw: ${e}`);
		process.exit(1);
	}

	// 2. SprintContract has tokenBudget
	assert(
		typeof classifierOutput.sprintContract.tokenBudget === "number" &&
			classifierOutput.sprintContract.tokenBudget >= 2000,
		"SprintContract.tokenBudget is a number >= 2000",
	);

	// 3. SprintContract has likelyFailureModes
	assert(
		Array.isArray(classifierOutput.sprintContract.likelyFailureModes) &&
			classifierOutput.sprintContract.likelyFailureModes.length > 0,
		"SprintContract.likelyFailureModes is non-empty",
	);

	// 4. Retriever runs and returns object within budget
	const config = {
		maxCandidates: 3,
		topKRetrieval: 5,
		maxContextTokens: 8000,
		enableVerifier: false,
		enableMetaLoop: false,
		language: "cpp" as const,
		logDir: "/tmp",
		archiveDir: "/tmp/validate-archive",
		gotchasDir: "/tmp",
	};
	const retrievalContext = await retriever.retrieve(classifierOutput, config);
	assert(retrievalContext !== null, "Retriever returns a context object");

	// 5. Prompter assembles within token budget
	const pkg = prompter.build(problem, classifierOutput, retrievalContext, config);
	assert(
		pkg.contextTokenEstimate <= classifierOutput.sprintContract.tokenBudget,
		`PromptPackage tokens (${pkg.contextTokenEstimate}) <= tokenBudget (${classifierOutput.sprintContract.tokenBudget})`,
	);

	// 6. GotchaStore has >= 3 records for dp domain
	const dpGotchas = INITIAL_GOTCHAS.filter((g) =>
		Array.isArray(g.domain) ? g.domain.includes("dp") : g.domain === "dp" || g.domain === "*",
	);
	assert(dpGotchas.length >= 3, `INITIAL_GOTCHAS has >= 3 dp-domain records (found ${dpGotchas.length})`);

	// 7. All gotchas have symptom field
	const missingSymptomsCount = INITIAL_GOTCHAS.filter((g) => !g.symptom || g.symptom.trim() === "").length;
	assert(missingSymptomsCount === 0, `All gotchas have non-empty symptom field (${missingSymptomsCount} missing)`);

	const elapsed = Date.now() - start;
	assert(elapsed < 5000, `Total elapsed time < 5000ms (actual: ${elapsed}ms)`);

	console.log(`\n${allPassed ? "✓ All assertions passed" : "✗ Some assertions FAILED"} (${elapsed}ms)`);
	process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
