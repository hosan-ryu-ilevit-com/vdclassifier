import {
  ClassificationLabel,
  ClassifierInput,
  ClassifierResult,
  ClassifierVote,
} from "@/lib/types";

const MODEL_NAME = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
const PROMPT_VERSION = "v1.1.0";
const API_BASE =
  process.env.GEMINI_API_BASE ??
  "https://generativelanguage.googleapis.com/v1beta";

const SYSTEM_CRITERIA = `
당신은 설문 응답을 아래 4개 분류로 판정하는 심사자다.
- PRE_VD: 서비스 가치 공감 + 구매의향/행동이 강하고, 유지되면 아쉽다는 신호가 강함
- VSD: 전반 긍정이나 확신 부족/조건부 신호가 섞임
- NSD: 유용성은 일부 인정하나 신뢰/효용/구매 연결이 약함
- ND: 서비스 필요성 낮음, 불만이 큼, 혹은 도움되지 않음

원칙:
1) 응답 텍스트 근거 중심으로 판정한다.
2) 근거가 약하면 보수적으로 낮은 분류를 선택한다.
3) 출력은 반드시 JSON만 반환한다.
4) 입력 헤더가 다양해도 의미를 파악해 canonical 필드를 채운다.
5) NSD/ND는 핵심가치 공감이 약하거나 없는 경우에 해당한다.
6) coreValueUnderstood는 fitScore, 맞춤형 이유, 좋았던 점/아쉬운 점, 구매의향 관련 주관식을 종합해 판단한다.
7) "purchaseIntent"는 반드시 "이 서비스에서 추천받은 상품에 대한 구매의향"을 의미한다.
8) "purchaseTiming"은 반드시 위 purchaseIntent와 무관한 "해당 카테고리의 원래 구매 계획/시기"를 의미한다.
9) purchaseIntent와 purchaseTiming을 서로 혼합하거나 대체하지 않는다.
10) coreValueUnderstood를 true/false로 반환할 때는 coreValueReason에 근거를 반드시 작성한다.
11) 어뷰저 여부를 판단한다. 어뷰저는 주관식이 지나치게 짧거나 성의 없는 표현만 반복되어 설문 신뢰가 낮은 응답자다.
`;

type GeminiPayload = {
  label: string;
  rationale: string;
  warningSignals?: string[];
  usedColumns?: string[];
  isAbuser?: boolean | null;
  abuserReason?: string;
  coreValueUnderstood?: boolean;
  coreValueReason?: string;
  normalized?: {
    pmf?: string;
    slightReason?: string;
    whyThink?: string;
    fitScore?: number | null;
    fitReason?: string;
    bestPoint?: string;
    bestPointSummary?: string;
    purchaseTiming?: string;
    purchaseIntent?: string;
    purchasePlanned?: boolean | null;
    purchaseIntentCombined?: string;
    buyReason?: string;
    improvement?: string;
    downsideSummary?: string;
    judgementReason?: string;
  };
};

const tieBreakerOrder: ClassificationLabel[] = ["ND", "NSD", "VSD", "PRE_VD"];

function extractJsonObject(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    return text;
  }

  return text.slice(first, last + 1);
}

function toLabel(value: string): ClassificationLabel {
  const normalized = value.trim().toUpperCase().replaceAll("-", "_");

  if (normalized === "PRE_VD") return "PRE_VD";
  if (normalized === "VSD") return "VSD";
  if (normalized === "NSD") return "NSD";
  return "ND";
}

function buildPrompt(input: ClassifierInput): string {
  const userCriteriaBlock = input.userCriteria?.trim()
    ? `\n사용자 추가 기준:\n${input.userCriteria.trim()}\n`
    : "\n사용자 추가 기준: 없음\n";
  const coreValueBlock = input.coreValue?.trim()
    ? `\n서비스 핵심가치 정의:\n${input.coreValue.trim()}\n`
    : "\n서비스 핵심가치 정의: 없음\n";
  const abuserCriteriaBlock = input.abuserCriteria?.trim()
    ? `\n어뷰저 판단 기준(사용자 입력):\n${input.abuserCriteria.trim()}\n`
    : "\n어뷰저 판단 기준(사용자 입력): 기본 기준 사용\n";
  const discoveryCriteriaBlock = input.discoveryCriteria?.trim()
    ? `\n디스커버리형 판단 기준(사용자 입력):\n${input.discoveryCriteria.trim()}\n`
    : "\n디스커버리형 판단 기준(사용자 입력): 기본 기준 사용\n";

  return `
${SYSTEM_CRITERIA}
${userCriteriaBlock}
${coreValueBlock}
${abuserCriteriaBlock}
${discoveryCriteriaBlock}
입력 데이터(JSON):
${JSON.stringify(
    {
      rowIndex: input.rowIndex,
      normalized: input.normalized,
      rawData: input.rawData,
      rawEntries: input.rawEntries ?? [],
    },
    null,
    2,
  )}

출력 스키마:
{
  "label": "PRE_VD | VSD | NSD | ND",
  "rationale": "최종 분류 판단 근거(핵심 근거 1~3문장)",
  "warningSignals": ["선택적 경고 시그널"],
  "usedColumns": ["판단에 실제 사용한 원본 헤더명"],
  "isAbuser": "boolean | null",
  "abuserReason": "어뷰저로 봤는지/아닌지에 대한 1문장 근거",
  "coreValueUnderstood": "boolean | null",
  "coreValueReason": "핵심가치 이해 여부를 그렇게 판단한 근거 1~2문장",
  "normalized": {
    "pmf": "매우 아쉬움 | 조금 아쉬움 | 별로 아쉽지 않음 | null",
    "slightReason": "string | null",
    "whyThink": "string | null",
    "fitScore": "0~10 number | null",
    "fitReason": "string | null",
    "bestPoint": "string | null",
    "bestPointSummary": "주관식 종합된 가장 좋은 점",
    "purchaseTiming": "해당 카테고리 원래 구매 계획/시기(추천상품 구매의향과 별개) | null",
    "purchaseIntent": "이 서비스에서 추천받은 상품에 대한 구매의향 | null",
    "purchasePlanned": "boolean | null",
    "purchaseIntentCombined": "추천상품 구매의향(객관식) + 추천상품 구매 관련 주관식 종합",
    "buyReason": "string | null",
    "improvement": "string | null",
    "downsideSummary": "주관식 종합된 아쉬운 점",
    "judgementReason": "string | null"
  }
}
`;
}

function normalizePMF(value?: string): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (!text) return undefined;

  if (text.includes("매우")) return "매우 아쉬움";
  if (text.includes("조금")) return "조금 아쉬움";
  if (text.includes("별로")) return "별로 아쉽지 않음";
  return undefined;
}

function sanitizeUsedColumns(
  input: string[] | undefined,
  allowedHeaders: string[],
): string[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const allowed = new Set(allowedHeaders);
  const unique: string[] = [];

  for (const col of input) {
    const header = `${col ?? ""}`.trim();
    if (!header || !allowed.has(header)) continue;
    if (!unique.includes(header)) unique.push(header);
  }

  return unique;
}

function sanitizeNormalized(
  input: GeminiPayload["normalized"],
): ClassifierResult["normalizedData"] {
  if (!input) return {};

  const fitScore =
    typeof input.fitScore === "number" && Number.isFinite(input.fitScore)
      ? Math.min(10, Math.max(0, Number(input.fitScore.toFixed(1))))
      : null;

  return {
    pmf: normalizePMF(input.pmf),
    slightReason: input.slightReason?.trim() || undefined,
    whyThink: input.whyThink?.trim() || undefined,
    fitScore,
    fitReason: input.fitReason?.trim() || undefined,
    bestPoint: input.bestPoint?.trim() || undefined,
    bestPointSummary: input.bestPointSummary?.trim() || undefined,
    purchaseTiming: input.purchaseTiming?.trim() || undefined,
    purchaseIntent: input.purchaseIntent?.trim() || undefined,
    purchasePlanned:
      typeof input.purchasePlanned === "boolean" ? input.purchasePlanned : null,
    purchaseIntentCombined: input.purchaseIntentCombined?.trim() || undefined,
    buyReason: input.buyReason?.trim() || undefined,
    improvement: input.improvement?.trim() || undefined,
    downsideSummary: input.downsideSummary?.trim() || undefined,
    judgementReason: input.judgementReason?.trim() || undefined,
  };
}

async function requestGemini(prompt: string, temperature: number) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(
    `${API_BASE}/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text as string;
}

async function singleVote(
  input: ClassifierInput,
  sampleIndex: number,
  sampleCount: number,
): Promise<
  ClassifierVote & {
    normalizedData: ClassifierResult["normalizedData"];
    usedColumns: string[];
  }
> {
  const prompt = buildPrompt(input);
  const temperature = sampleCount > 1 ? 0.35 : 0.1;
  const raw = await requestGemini(prompt, temperature + sampleIndex * 0.02);
  const jsonText = extractJsonObject(raw);
  const parsed = JSON.parse(jsonText) as GeminiPayload;
  const allowedHeaders = (input.rawEntries ?? []).map((x) => x.header);
  const usedColumns = sanitizeUsedColumns(parsed.usedColumns, allowedHeaders);

  return {
    label: toLabel(parsed.label ?? "ND"),
    rationale: parsed.rationale?.trim() || "No rationale returned.",
    warningSignals: Array.isArray(parsed.warningSignals)
      ? parsed.warningSignals.map((x) => `${x}`)
      : [],
    usedColumns,
    isAbuser: typeof parsed.isAbuser === "boolean" ? parsed.isAbuser : null,
    abuserReason: parsed.abuserReason?.trim() || undefined,
    coreValueUnderstood:
      typeof parsed.coreValueUnderstood === "boolean"
        ? parsed.coreValueUnderstood
        : null,
    coreValueReason: parsed.coreValueReason?.trim() || undefined,
    normalizedData: sanitizeNormalized(parsed.normalized),
  };
}

function applyBusinessRules(
  label: ClassificationLabel,
  normalizedData: ClassifierResult["normalizedData"],
  coreValueUnderstood: boolean | null,
): ClassificationLabel {
  // If core value is not understood, enforce NSD/ND split by PMF.
  if (coreValueUnderstood === false) {
    if (normalizedData.pmf === "별로 아쉽지 않음") return "ND";
    if (normalizedData.pmf === "조금 아쉬움") return "NSD";
    return "NSD";
  }

  // NSD/ND should not happen when core value is clearly understood.
  if (coreValueUnderstood === true && (label === "NSD" || label === "ND")) {
    return "VSD";
  }

  return label;
}

function countMeaningfulLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function detectAbuser(normalizedData: ClassifierResult["normalizedData"]): boolean {
  const subjectiveAnswers = [
    normalizedData.bestPointSummary,
    normalizedData.bestPoint,
    normalizedData.downsideSummary,
    normalizedData.slightReason,
    normalizedData.fitReason,
    normalizedData.buyReason,
    normalizedData.improvement,
    normalizedData.judgementReason,
    normalizedData.whyThink,
  ]
    .map((value) => `${value ?? ""}`.trim())
    .filter((value) => value.length > 0);

  if (subjectiveAnswers.length === 0) return true;

  const lengths = subjectiveAnswers.map(countMeaningfulLength);
  const shortAnswerCount = lengths.filter((len) => len < 12).length;
  const averageLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;

  if (subjectiveAnswers.length === 1) return lengths[0] < 10;
  return shortAnswerCount / subjectiveAnswers.length >= 0.7 && averageLength < 18;
}

function detectAbuserByLlm(votes: ClassifierVote[]): {
  isAbuser: boolean;
  reason?: string;
} {
  const decisions = votes.filter((vote) => typeof vote.isAbuser === "boolean");
  if (decisions.length === 0) return { isAbuser: false };

  const positiveVotes = decisions.filter((vote) => vote.isAbuser).length;
  const isAbuser = positiveVotes / decisions.length >= 0.5;
  const reason = decisions.find((vote) => vote.isAbuser === isAbuser)?.abuserReason;
  return { isAbuser, reason };
}

function detectDiscoveryType(
  normalizedData: ClassifierResult["normalizedData"],
  warningSignals: string[],
): boolean {
  if (warningSignals.some((signal) => signal.includes("디스커버리형"))) {
    return true;
  }

  const purchaseTiming = `${normalizedData.purchaseTiming ?? ""}`.replace(/\s+/g, " ").trim();
  if (!purchaseTiming) return false;

  if (purchaseTiming.includes("구체적인 구매 계획은 없지만 정보가 궁금했습니다")) {
    return true;
  }

  const hasNoPlanSignal = /구매\s*계획.*없|계획.*없음|미정|없습니다/.test(purchaseTiming);
  const hasDiscoverySignal = /정보.*궁금/.test(purchaseTiming);
  return hasNoPlanSignal && hasDiscoverySignal;
}

function selectByMajority(votes: ClassifierVote[]): {
  label: ClassificationLabel;
  confidence: number;
} {
  const counts = new Map<ClassificationLabel, number>();
  for (const vote of votes) {
    counts.set(vote.label, (counts.get(vote.label) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topCount = ranked[0]?.[1] ?? 0;
  const tied = ranked
    .filter((x) => x[1] === topCount)
    .map((x) => x[0])
    .sort(
      (a, b) => tieBreakerOrder.indexOf(a) - tieBreakerOrder.indexOf(b),
    );

  const label = tied[0] ?? "ND";
  const confidence = votes.length ? topCount / votes.length : 0;
  return { label, confidence };
}

export function getPromptVersion(): string {
  return PROMPT_VERSION;
}

export function getModelName(): string {
  return MODEL_NAME;
}

export function getSystemCriteria(): string {
  return SYSTEM_CRITERIA;
}

export async function classifyWithSelfConsistency(
  input: ClassifierInput,
  sampleCount = 3,
): Promise<ClassifierResult> {
  const start = Date.now();
  const votes: Array<
    ClassifierVote & {
      normalizedData: ClassifierResult["normalizedData"];
      usedColumns: string[];
    }
  > = [];

  for (let i = 0; i < sampleCount; i++) {
    const vote = await singleVote(input, i, sampleCount);
    votes.push(vote);
  }

  const majority = selectByMajority(votes);
  const selectedVote =
    votes.find((v) => v.label === majority.label) ?? votes[0] ?? null;
  const selectedNormalized = selectedVote?.normalizedData ?? input.normalized;
  const selectedCoreValueUnderstood = selectedVote?.coreValueUnderstood ?? null;
  const finalLabel = applyBusinessRules(
    majority.label,
    selectedNormalized,
    selectedCoreValueUnderstood,
  );
  const ruleBasedAbuser = detectAbuser(selectedNormalized);
  const llmAbuser = detectAbuserByLlm(votes);
  const isAbuser = ruleBasedAbuser || llmAbuser.isAbuser;
  const warningSignals = [...(selectedVote?.warningSignals ?? [])];
  const isDiscoveryType = detectDiscoveryType(selectedNormalized, warningSignals);
  if (llmAbuser.reason && !warningSignals.includes(`LLM 어뷰저 판단: ${llmAbuser.reason}`)) {
    warningSignals.push(`LLM 어뷰저 판단: ${llmAbuser.reason}`);
  }
  if (isAbuser && !warningSignals.includes("어뷰저 의심")) {
    warningSignals.push("어뷰저 의심");
  }
  if (isDiscoveryType && !warningSignals.includes("디스커버리형")) {
    warningSignals.push("디스커버리형");
  }

  return {
    finalLabel,
    confidence: Number(majority.confidence.toFixed(4)),
    rationale: selectedVote?.rationale ?? "No rationale.",
    warningSignals,
    isAbuser,
    isDiscoveryType,
    normalizedData: selectedNormalized,
    usedColumns: selectedVote?.usedColumns ?? [],
    coreValueUnderstood: selectedCoreValueUnderstood,
    coreValueReason: selectedVote?.coreValueReason ?? undefined,
    votes,
    latencyMs: Date.now() - start,
  };
}
