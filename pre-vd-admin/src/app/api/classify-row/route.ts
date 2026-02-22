import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  classifyWithSelfConsistency,
  getModelName,
  getPromptVersion,
  getSystemCriteria,
} from "@/lib/classifier";
import { normalizeSurveyRow } from "@/lib/normalize";

const payloadSchema = z.object({
  rowIndex: z.number().int().min(1),
  rawData: z.record(z.string(), z.string()),
  rawEntries: z
    .array(
      z.object({
        header: z.string(),
        value: z.string(),
        columnIndex: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  criteria: z.string().optional(),
  coreValue: z.string().optional(),
  abuserCriteria: z.string().optional(),
  discoveryCriteria: z.string().optional(),
  sampleCount: z.number().int().min(1).max(7).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = payloadSchema.parse(body);
    const sampleCount = payload.sampleCount ?? 3;
    const normalized = normalizeSurveyRow(payload.rawData);

    const result = await classifyWithSelfConsistency(
      {
        rowIndex: payload.rowIndex,
        rawData: payload.rawData,
        rawEntries: payload.rawEntries,
        normalized,
        userCriteria: payload.criteria,
        coreValue: payload.coreValue,
        abuserCriteria: payload.abuserCriteria,
        discoveryCriteria: payload.discoveryCriteria,
      },
      sampleCount,
    );

    return NextResponse.json({
      row: {
        modelLabel: result.finalLabel,
        finalLabel: result.finalLabel,
        confidence: result.confidence,
        rationale: result.rationale,
        warningSignals: result.warningSignals,
        isAbuser: result.isAbuser,
        isDiscoveryType: result.isDiscoveryType,
        usedColumns: result.usedColumns,
        coreValueUnderstood: result.coreValueUnderstood,
        coreValueReason: result.coreValueReason,
        normalizedData: result.normalizedData,
        votes: result.votes,
      },
      runMeta: {
        modelName: getModelName(),
        promptVersion: getPromptVersion(),
        sampleCount,
        temperature: sampleCount > 1 ? 0.35 : 0.1,
        systemCriteria: getSystemCriteria(),
        userCriteria: payload.criteria || null,
        coreValue: payload.coreValue || null,
        abuserCriteria: payload.abuserCriteria || null,
        discoveryCriteria: payload.discoveryCriteria || null,
        latencyMs: result.latencyMs,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to classify row.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
