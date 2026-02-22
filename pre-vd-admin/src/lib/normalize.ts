import { NormalizedSurveyRow } from "@/lib/types";

const keyAliases: Record<keyof NormalizedSurveyRow, string[]> = {
  pmf: ["PMF", "pmf"],
  slightReason: ["아쉬움 이유", "slight_reason"],
  whyThink: ["그렇게 생각한 이유", "why_think"],
  fitScore: ["맞춤", "맞춤점수", "fit_score", "score"],
  fitReason: ["맞춤형 이유", "fit_reason"],
  bestPoint: ["좋았던 점", "best_point"],
  bestPointSummary: ["가장 좋은 점", "best_point_summary"],
  purchaseTiming: [
    "원래 구매 시기",
    "원래구매시기",
    "해당 카테고리 원래 구매 시기",
    "카테고리 구매시기",
    "구매시기",
    "purchase_timing",
    "original_purchase_timing",
  ],
  purchaseIntent: [
    "이 서비스에서 추천받은 상품에 대한 구매의향",
    "추천상품 구매의향",
    "추천 상품 구매의향",
    "추천상품_구매의향",
    "구매의향",
    "purchase_intent",
    "recommended_product_purchase_intent",
  ],
  purchasePlanned: ["구매예정여부", "purchase_planned"],
  purchaseIntentCombined: [
    "추천상품 구매의향_종합",
    "추천 상품 구매의향 종합",
    "구매의향_종합",
    "purchase_intent_combined",
  ],
  buyReason: ["구매 이유", "buy_reason"],
  improvement: ["개선", "improvement"],
  downsideSummary: ["아쉬운 점", "downside_summary"],
  judgementReason: ["판단 이유", "judgement_reason"],
};

function pickValue(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    if (row[alias] !== undefined) {
      return `${row[alias] ?? ""}`.trim();
    }
  }

  return "";
}

function parseScore(scoreText: string): number | null {
  if (!scoreText) return null;
  const matched = scoreText.match(/-?\d+(\.\d+)?/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferPurchasePlanned(
  purchasePlannedText: string,
  purchaseIntentText: string,
): boolean | null {
  const planned = `${purchasePlannedText} ${purchaseIntentText}`.toLowerCase();
  if (!planned.trim()) return null;

  const positiveSignals = [
    "구매",
    "장바구니",
    "곧구매",
    "이미구매",
    "당장",
    "예정",
    "a",
    "b",
  ];
  const negativeSignals = ["참고만", "확신없음", "미정", "없음"];

  if (negativeSignals.some((x) => planned.includes(x))) return false;
  if (positiveSignals.some((x) => planned.includes(x))) return true;
  return null;
}

export function normalizeSurveyRow(
  row: Record<string, string>,
): NormalizedSurveyRow {
  const pmf = pickValue(row, keyAliases.pmf);
  const slightReason = pickValue(row, keyAliases.slightReason);
  const whyThink = pickValue(row, keyAliases.whyThink);
  const fitScoreText = pickValue(row, keyAliases.fitScore);
  const fitReason = pickValue(row, keyAliases.fitReason);
  const bestPoint = pickValue(row, keyAliases.bestPoint);
  const bestPointSummary = pickValue(row, keyAliases.bestPointSummary);
  const purchaseTiming = pickValue(row, keyAliases.purchaseTiming);
  const purchaseIntent = pickValue(row, keyAliases.purchaseIntent);
  const purchasePlannedText = pickValue(row, keyAliases.purchasePlanned);
  const purchaseIntentCombined = pickValue(row, keyAliases.purchaseIntentCombined);
  const buyReason = pickValue(row, keyAliases.buyReason);
  const improvement = pickValue(row, keyAliases.improvement);
  const downsideSummary = pickValue(row, keyAliases.downsideSummary);
  const judgementReason = pickValue(row, keyAliases.judgementReason);

  return {
    pmf: pmf || undefined,
    slightReason: slightReason || undefined,
    whyThink: whyThink || undefined,
    fitScore: parseScore(fitScoreText),
    fitReason: fitReason || undefined,
    bestPoint: bestPoint || undefined,
    bestPointSummary: bestPointSummary || undefined,
    purchaseTiming: purchaseTiming || undefined,
    purchaseIntent: purchaseIntent || undefined,
    purchasePlanned: inferPurchasePlanned(purchasePlannedText, purchaseIntent),
    purchaseIntentCombined: purchaseIntentCombined || undefined,
    buyReason: buyReason || undefined,
    improvement: improvement || undefined,
    downsideSummary: downsideSummary || undefined,
    judgementReason: judgementReason || undefined,
  };
}
