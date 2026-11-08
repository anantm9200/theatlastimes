import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAiJson, parseAnalysis } from "../src/server/ai";

test("accepts ordinary JSON and fenced JSON", () => {
  assert.deepEqual(JSON.parse(normalizeAiJson('{"supported":true}')), { supported: true });
  assert.deepEqual(JSON.parse(normalizeAiJson('```json\n{"supported":false}\n```')), { supported: false });
});
test("accepts a reasoning wrapper only when the final answer is valid JSON", () => {
  assert.equal(JSON.parse(normalizeAiJson('<think>Reasoning is ignored.</think> {"supported":true}')).supported, true);
});
test("never converts malformed AI answers into publishable objects", () => {
  assert.throws(()=>normalizeAiJson('The report is confirmed.'), /invalid JSON/);
  assert.throws(()=>normalizeAiJson('{"supported":true} unrelated conclusion'), /invalid JSON/);
  assert.throws(()=>normalizeAiJson('[]'), /must be an object/);
});
test("article summary must include substantive fields", () => {
  const parsed=parseAnalysis(JSON.stringify({
    keyPoints:["The supplied source reports a new event."],
    whyItMatters:"Source-backed implication.",
    detailedHumanizedSummary:"A documented, attributed event occurred.",
  }));
  assert.equal(parsed.keyPoints.length,1);
  assert.throws(()=>parseAnalysis('{"keyPoints":[],"whyItMatters":"x","detailedHumanizedSummary":"x"}'),/invalid analysis/);
});
