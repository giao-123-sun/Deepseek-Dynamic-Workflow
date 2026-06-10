import { DeepSeekClient } from "../deepseek-client.js";

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  throw new Error("DEEPSEEK_API_KEY is required.");
}

const client = new DeepSeekClient({
  apiKey,
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"
});

const userId = process.env.DEEPSEEK_USER_ID ?? "cf_dw_cache_probe_v1";
const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

const stablePrefix = [
  "DDW cache probe stable prefix v1.",
  "This exact text should be reused across calls.",
  "Reply with one short sentence."
].join("\n");

for (const suffix of ["A", "B", "C"]) {
  const started = Date.now();
  const response = await client.chat({
    model,
    userId,
    temperature: 0,
    messages: [
      { role: "system", content: "You are a cache probe assistant." },
      { role: "user", content: `${stablePrefix}\nProbe suffix: ${suffix}` }
    ]
  });
  const usage = response.usage ?? {};
  console.log(
    JSON.stringify({
      suffix,
      latencyMs: Date.now() - started,
      prompt_cache_hit_tokens: usage.prompt_cache_hit_tokens ?? 0,
      prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0
    })
  );
}
