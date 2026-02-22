import Papa from "papaparse";
import { NextRequest, NextResponse } from "next/server";
import {
  classifyWithSelfConsistency,
  getModelName,
  getPromptVersion,
  getSystemCriteria,
} from "@/lib/classifier";
import { normalizeSurveyRow } from "@/lib/normalize";

const MAX_SYNC_ROWS = Number(process.env.MAX_SYNC_ROWS ?? 120);

function cleanRawRecord(raw: Record<string, unknown>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    cleaned[key.trim()] = `${value ?? ""}`.trim();
  }
  return cleaned;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const userCriteria = `${formData.get("criteria") ?? ""}`.trim();
    const coreValue = `${formData.get("coreValue") ?? ""}`.trim();
    const abuserCriteria = `${formData.get("abuserCriteria") ?? ""}`.trim();
    const discoveryCriteria = `${formData.get("discoveryCriteria") ?? ""}`.trim();
    const sampleCountRaw = Number(`${formData.get("sampleCount") ?? "3"}`);
    const sampleCount = Number.isFinite(sampleCountRaw)
      ? Math.min(Math.max(Math.floor(sampleCountRaw), 1), 7)
      : 3;
    const rowConcurrencyRaw = Number(`${formData.get("rowConcurrency") ?? "4"}`);
    const rowConcurrency = Number.isFinite(rowConcurrencyRaw)
      ? Math.min(Math.max(Math.floor(rowConcurrencyRaw), 1), 10)
      : 4;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV file is required." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only CSV files are supported." },
        { status: 400 },
      );
    }

    const csvText = await file.text();
    const parsed = Papa.parse<string[]>(csvText, {
      header: false,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: parsed.errors[0]?.message ?? "CSV parse error" },
        { status: 400 },
      );
    }

    if (!parsed.data.length) {
      return NextResponse.json({ error: "CSV has no data." }, { status: 400 });
    }

    const rawHeaders = (parsed.data[0] ?? []).map((x) => `${x ?? ""}`.trim());
    const dataRows = parsed.data.slice(1);
    const rows = dataRows
      .map((cells) => {
        const rawData: Record<string, string> = {};
        const rawEntries: Array<{ header: string; value: string; columnIndex: number }> = [];

        const maxLength = Math.max(rawHeaders.length, cells.length);
        for (let i = 0; i < maxLength; i++) {
          const originalHeader = rawHeaders[i] || `column_${i + 1}`;
          const header = originalHeader.trim() || `column_${i + 1}`;
          const value = `${cells[i] ?? ""}`.trim();

          rawEntries.push({ header, value, columnIndex: i });
          if (rawData[header] === undefined) {
            rawData[header] = value;
          } else {
            rawData[header] = `${rawData[header]}\n---\n${value}`;
          }
        }

        return { rawData: cleanRawRecord(rawData), rawEntries };
      })
      .filter((x) => Object.values(x.rawData).some((v) => v.length > 0));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV has no valid rows." },
        { status: 400 },
      );
    }

    if (rows.length > MAX_SYNC_ROWS) {
      return NextResponse.json(
        {
          error: `Sync mode max rows exceeded (${MAX_SYNC_ROWS}).`,
        },
        { status: 400 },
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const writeEvent = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };

        try {
          writeEvent({
            type: "start",
            filename: file.name,
            totalRows: rows.length,
            sampleCount,
            rowConcurrency,
          });

          const classifiedRows: Array<Record<string, unknown>> = new Array(rows.length);
          let nextIndex = 0;
          let processedRows = 0;

          const worker = async () => {
            while (true) {
              const currentIndex = nextIndex;
              nextIndex += 1;
              if (currentIndex >= rows.length) return;

              const { rawData, rawEntries } = rows[currentIndex];
              const normalized = normalizeSurveyRow(rawData);
              const result = await classifyWithSelfConsistency(
                {
                  rowIndex: currentIndex + 1,
                  normalized,
                  rawData,
                  rawEntries,
                  userCriteria: userCriteria || undefined,
                  coreValue: coreValue || undefined,
                  abuserCriteria: abuserCriteria || undefined,
                  discoveryCriteria: discoveryCriteria || undefined,
                },
                sampleCount,
              );

              classifiedRows[currentIndex] = {
                id: crypto.randomUUID(),
                rowIndex: currentIndex + 1,
                rawData,
                rawEntries,
                normalizedData: result.normalizedData,
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
                votes: result.votes,
                runMeta: {
                  modelName: getModelName(),
                  promptVersion: getPromptVersion(),
                  sampleCount,
                  rowConcurrency,
                  temperature: sampleCount > 1 ? 0.35 : 0.1,
                  systemCriteria: getSystemCriteria(),
                  userCriteria: userCriteria || null,
                  coreValue: coreValue || null,
                  abuserCriteria: abuserCriteria || null,
                  discoveryCriteria: discoveryCriteria || null,
                  latencyMs: result.latencyMs,
                },
              };

              processedRows += 1;
              writeEvent({
                type: "progress",
                processedRows,
                totalRows: rows.length,
                percent: Number(((processedRows / rows.length) * 100).toFixed(1)),
                rowIndex: currentIndex + 1,
                currentLabel: result.finalLabel,
              });
            }
          };

          await Promise.all(
            Array.from(
              { length: Math.min(rowConcurrency, rows.length) },
              () => worker(),
            ),
          );

          writeEvent({
            type: "complete",
            payload: {
              uploadId: crypto.randomUUID(),
              filename: file.name,
              modelName: getModelName(),
              rowConcurrency,
              headers: rawHeaders,
              totalRows: rows.length,
              processedRows: rows.length,
              rows: classifiedRows,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to classify CSV.";
          writeEvent({
            type: "error",
            message,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to classify CSV.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
