"use client";

import { Fragment, useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import type { ClassificationLabel } from "@/lib/types";

type SurveyResponseItem = {
  id: string;
  rowIndex: number;
  modelLabel: ClassificationLabel;
  finalLabel: ClassificationLabel;
  confidence: number;
  rationale: string;
  isAbuser?: boolean;
  isDiscoveryType?: boolean;
  rawData: Record<string, string>;
  rawEntries?: Array<{ header: string; value: string; columnIndex: number }>;
  normalizedData: Record<string, unknown>;
  warningSignals?: string[];
  usedColumns?: string[];
  coreValueUnderstood?: boolean | null;
  coreValueReason?: string;
  manualEdits?: Array<{
    previousLabel: ClassificationLabel;
    nextLabel: ClassificationLabel;
    reason: string;
    editedAt: string;
  }>;
};

type ReportPayload = {
  total: number;
  byLabel: Record<string, { count: number; percent: number }>;
};

type AnalysisResult = {
  uploadId: string;
  filename: string;
  createdAt: string;
  criteria: string;
  coreValue: string;
  abuserCriteria: string;
  discoveryCriteria: string;
  sampleCount: number;
  rowConcurrency: number;
  totalRows: number;
  processedRows: number;
  rows: SurveyResponseItem[];
  report: ReportPayload;
};

type StreamCompletePayload = {
  uploadId: string;
  filename: string;
  rowConcurrency?: number;
  totalRows: number;
  processedRows: number;
  rows: SurveyResponseItem[];
};

const KEY_CRITERIA = "classificationCriteria";
const KEY_CORE_VALUE = "serviceCoreValue";
const KEY_ABUSER_CRITERIA = "abuserCriteria";
const KEY_DISCOVERY_CRITERIA = "discoveryCriteria";
const KEY_ANALYSIS = "latestClassificationResult";
const KEY_ROW_CONCURRENCY = "rowConcurrency";

const DEFAULT_ABUSER_CRITERIA =
  "주관식 응답이 지나치게 짧거나 의미 없는 단답/반복 표현만 있어 설문 신뢰도가 낮다고 판단되면 어뷰저로 분류한다.";
const DEFAULT_DISCOVERY_CRITERIA =
  "구매 타이밍 응답에서 구매 계획이 없고 '구체적인 구매 계획은 없지만 정보가 궁금했습니다'에 해당하면 디스커버리형으로 분류한다.";

const LABEL_ORDER: ClassificationLabel[] = ["VD", "PRE_VD", "VSD", "NSD", "ND"];
const LABEL_VIEW: Record<ClassificationLabel, string> = {
  VD: "VD",
  PRE_VD: "Pre-VD",
  VSD: "VSD",
  NSD: "NSD",
  ND: "ND",
};

const BASE_COLUMNS: Array<{ id: string; label: string; className: string }> = [
  { id: "confidence", label: "confidence", className: "col-confidence" },
  { id: "pmf", label: "PMF", className: "col-pmf" },
  { id: "fitScore", label: "추천 맞춤형으로 느낀 정도", className: "col-fit-score" },
  {
    id: "purchaseIntentCombined",
    label: "구매의향(추천상품 기준)",
    className: "col-purchase-intent",
  },
  {
    id: "purchaseTiming",
    label: "원래 구매 시기(카테고리 기준)",
    className: "col-purchase-timing",
  },
  {
    id: "coreValueUnderstood",
    label: "핵심가치 이해 여부",
    className: "col-core-value",
  },
  { id: "bestPointSummary", label: "가장 좋은 점", className: "col-best-point" },
  { id: "downsideSummary", label: "아쉬운 점", className: "col-downside" },
  { id: "rationale", label: "최종 분류 판단 근거", className: "col-rationale" },
];

function labelRowClass(label: ClassificationLabel): string {
  if (label === "VD") return "row-vd";
  if (label === "PRE_VD") return "row-prevd";
  if (label === "VSD") return "row-vsd";
  return "row-nsd";
}

export default function AdminDashboard() {
  const [criteria, setCriteria] = useState("");
  const [coreValue, setCoreValue] = useState("");
  const [abuserCriteria, setAbuserCriteria] = useState(DEFAULT_ABUSER_CRITERIA);
  const [discoveryCriteria, setDiscoveryCriteria] = useState(DEFAULT_DISCOVERY_CRITERIA);
  const [isCriteriaEditing, setIsCriteriaEditing] = useState(true);
  const [isCoreValueEditing, setIsCoreValueEditing] = useState(true);
  const [isAbuserCriteriaEditing, setIsAbuserCriteriaEditing] = useState(false);
  const [isDiscoveryCriteriaEditing, setIsDiscoveryCriteriaEditing] = useState(false);
  const [sampleCount, setSampleCount] = useState<number>(3);
  const [rowConcurrency, setRowConcurrency] = useState<number>(4);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({
    active: false,
    processedRows: 0,
    totalRows: 0,
    percent: 0,
    message: "",
  });

  const [editReasonById, setEditReasonById] = useState<Record<string, string>>({});
  const [editLabelById, setEditLabelById] = useState<
    Record<string, ClassificationLabel>
  >({});
  const [expandedRawRowId, setExpandedRawRowId] = useState<string | null>(null);
  const [excludeAbuser, setExcludeAbuser] = useState(false);
  const [excludeDiscoveryType, setExcludeDiscoveryType] = useState(false);

  useEffect(() => {
    try {
      const savedCriteria = localStorage.getItem(KEY_CRITERIA);
      const savedCore = localStorage.getItem(KEY_CORE_VALUE);
      const savedAbuser = localStorage.getItem(KEY_ABUSER_CRITERIA);
      const savedDiscovery = localStorage.getItem(KEY_DISCOVERY_CRITERIA);
      const savedConcurrency = localStorage.getItem(KEY_ROW_CONCURRENCY);
      const savedAnalysis = localStorage.getItem(KEY_ANALYSIS);
      if (savedCriteria) {
        setCriteria(savedCriteria);
        setIsCriteriaEditing(false);
      }
      if (savedCore) {
        setCoreValue(savedCore);
        setIsCoreValueEditing(false);
      }
      if (savedAbuser !== null) {
        setAbuserCriteria(savedAbuser);
      } else {
        setAbuserCriteria(DEFAULT_ABUSER_CRITERIA);
      }
      if (savedDiscovery !== null) {
        setDiscoveryCriteria(savedDiscovery);
      } else {
        setDiscoveryCriteria(DEFAULT_DISCOVERY_CRITERIA);
      }
      if (savedConcurrency) {
        const parsed = Number(savedConcurrency);
        if (Number.isFinite(parsed)) {
          setRowConcurrency(Math.min(Math.max(Math.floor(parsed), 1), 10));
        }
      }
      if (savedAnalysis) {
        const parsed = JSON.parse(savedAnalysis) as AnalysisResult;
        setAnalysis(parsed);
        const labels: Record<string, ClassificationLabel> = {};
        for (const row of parsed.rows) labels[row.id] = row.finalLabel;
        setEditLabelById(labels);
      }
    } catch {
      // ignore localStorage parse errors and continue with defaults
    }
  }, []);

  function buildReport(rows: SurveyResponseItem[]): ReportPayload {
    const total = rows.length;
    const byLabel: Record<string, { count: number; percent: number }> = {
      VD: { count: 0, percent: 0 },
      PRE_VD: { count: 0, percent: 0 },
      VSD: { count: 0, percent: 0 },
      NSD: { count: 0, percent: 0 },
      ND: { count: 0, percent: 0 },
    };

    for (const row of rows) byLabel[row.finalLabel].count += 1;
    for (const key of Object.keys(byLabel)) {
      const count = byLabel[key].count;
      byLabel[key].percent = total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
    }
    return { total, byLabel };
  }

  function resolveValue(row: SurveyResponseItem, key: string): unknown {
    if (key === "confidence") return row.confidence;
    if (key === "rationale") return row.rationale;
    if (key === "coreValueUnderstood") return row.coreValueUnderstood;

    if (key === "purchaseIntentCombined") {
      const combined = `${row.normalizedData.purchaseIntentCombined ?? ""}`.trim();
      if (combined) return combined;
      const intent = `${row.normalizedData.purchaseIntent ?? ""}`.trim();
      const buyReason = `${row.normalizedData.buyReason ?? ""}`.trim();
      if (intent && buyReason) return `${intent} / ${buyReason}`;
      return intent || buyReason;
    }

    if (key === "bestPointSummary") {
      const summary = `${row.normalizedData.bestPointSummary ?? ""}`.trim();
      return summary || `${row.normalizedData.bestPoint ?? ""}`.trim();
    }

    if (key === "downsideSummary") {
      const summary = `${row.normalizedData.downsideSummary ?? ""}`.trim();
      if (summary) return summary;
      const slight = `${row.normalizedData.slightReason ?? ""}`.trim();
      const improve = `${row.normalizedData.improvement ?? ""}`.trim();
      if (slight && improve) return `${slight} / ${improve}`;
      return slight || improve;
    }

    return row.normalizedData[key];
  }

  function persistSettings() {
    localStorage.setItem(KEY_CRITERIA, criteria);
    localStorage.setItem(KEY_CORE_VALUE, coreValue);
    localStorage.setItem(KEY_ABUSER_CRITERIA, abuserCriteria);
    localStorage.setItem(KEY_DISCOVERY_CRITERIA, discoveryCriteria);
    localStorage.setItem(KEY_ROW_CONCURRENCY, `${rowConcurrency}`);
  }

  function saveCriteria() {
    const trimmed = criteria.trim();
    if (!trimmed) {
      setError("분류 기준을 입력해주세요.");
      return;
    }
    setCriteria(trimmed);
    localStorage.setItem(KEY_CRITERIA, trimmed);
    setIsCriteriaEditing(false);
    setError("");
  }

  function saveCoreValue() {
    const trimmed = coreValue.trim();
    if (!trimmed) {
      setError("서비스 핵심가치를 입력해주세요.");
      return;
    }
    setCoreValue(trimmed);
    localStorage.setItem(KEY_CORE_VALUE, trimmed);
    setIsCoreValueEditing(false);
    setError("");
  }

  function saveAbuserCriteria() {
    const trimmed = abuserCriteria.trim();
    setAbuserCriteria(trimmed);
    localStorage.setItem(KEY_ABUSER_CRITERIA, trimmed);
    setIsAbuserCriteriaEditing(false);
    setError("");
  }

  function saveDiscoveryCriteria() {
    const trimmed = discoveryCriteria.trim();
    setDiscoveryCriteria(trimmed);
    localStorage.setItem(KEY_DISCOVERY_CRITERIA, trimmed);
    setIsDiscoveryCriteriaEditing(false);
    setError("");
  }

  function persistAnalysis(next: AnalysisResult) {
    setAnalysis(next);
    localStorage.setItem(KEY_ANALYSIS, JSON.stringify(next));
  }

  function setSelectedUploadFile(file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isCsv = lower.endsWith(".csv") || file.type === "text/csv";
    if (!isCsv) {
      setError("CSV 파일만 업로드할 수 있습니다.");
      return;
    }
    setUploadFile(file);
    setError("");
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedUploadFile(file);
  }

  function clampNumberInput(value: string, fallback: number, min: number, max: number) {
    if (!value.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.floor(parsed), min), max);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    setSelectedUploadFile(file);
  }

  async function handleUploadAndClassify() {
    if (!uploadFile) {
      setError("CSV 파일을 먼저 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setProgress({
      active: true,
      processedRows: 0,
      totalRows: 0,
      percent: 0,
      message: "분류 준비 중...",
    });

    try {
      persistSettings();
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("criteria", criteria);
      formData.append("coreValue", coreValue);
      formData.append("abuserCriteria", abuserCriteria);
      formData.append("discoveryCriteria", discoveryCriteria);
      formData.append("sampleCount", `${sampleCount}`);
      formData.append("rowConcurrency", `${rowConcurrency}`);

      const response = await fetch("/api/classify", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error ?? "분류 요청 실패");
      }
      if (!response.body) {
        throw new Error("분류 스트림 응답을 받지 못했습니다.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedPayloadRaw: unknown = null;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as Record<string, unknown>;
        const type = `${event.type ?? ""}`;

        if (type === "start") {
          const totalRows = Number(event.totalRows ?? 0);
          setProgress({
            active: true,
            processedRows: 0,
            totalRows,
            percent: 0,
            message: `총 ${totalRows}개 응답 분류 시작`,
          });
          return;
        }

        if (type === "progress") {
          const processedRows = Number(event.processedRows ?? 0);
          const totalRows = Number(event.totalRows ?? 0);
          const percent = Number(event.percent ?? 0);
          const currentLabel = `${event.currentLabel ?? ""}`;
          setProgress({
            active: true,
            processedRows,
            totalRows,
            percent,
            message: `${processedRows}/${totalRows} 처리 중 (${currentLabel})`,
          });
          return;
        }

        if (type === "complete") {
          completedPayloadRaw = event.payload;
          setProgress((prev) => ({
            ...prev,
            percent: 100,
            message: "분류 완료",
          }));
          return;
        }

        if (type === "error") {
          throw new Error(`${event.message ?? "분류 중 오류"}`);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buffer.indexOf("\n");
          if (idx === -1) break;
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          processLine(line);
        }
      }

      if (buffer.trim()) processLine(buffer.trim());

      const completedPayload = completedPayloadRaw as StreamCompletePayload | null;
      if (!completedPayload) {
        throw new Error("분류 완료 이벤트를 받지 못했습니다.");
      }

      const nextAnalysis: AnalysisResult = {
        uploadId: completedPayload.uploadId,
        filename: completedPayload.filename,
        createdAt: new Date().toISOString(),
        criteria,
        coreValue,
        abuserCriteria,
        discoveryCriteria,
        sampleCount,
        rowConcurrency: completedPayload.rowConcurrency ?? rowConcurrency,
        totalRows: completedPayload.totalRows,
        processedRows: completedPayload.processedRows,
        rows: completedPayload.rows,
        report: buildReport(completedPayload.rows),
      };
      persistAnalysis(nextAnalysis);

      const labels: Record<string, ClassificationLabel> = {};
      for (const row of completedPayload.rows) labels[row.id] = row.finalLabel;
      setEditLabelById(labels);
      setEditReasonById({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
      setProgress((prev) => ({ ...prev, active: false }));
    }
  }

  function saveManualEdit(row: SurveyResponseItem) {
    if (!analysis) return;
    const label = editLabelById[row.id];
    const reason = editReasonById[row.id]?.trim() ?? "";
    if (!label) {
      setError("수정할 라벨을 선택해주세요.");
      return;
    }

    const nextRows = analysis.rows.map((current) => {
      if (current.id !== row.id) return current;
      return {
        ...current,
        finalLabel: label,
        manualEdits: [
          {
            previousLabel: current.finalLabel,
            nextLabel: label,
            reason: reason || "사유 미입력",
            editedAt: new Date().toISOString(),
          },
          ...(current.manualEdits ?? []),
        ],
      };
    });

    persistAnalysis({
      ...analysis,
      rows: nextRows,
      report: buildReport(nextRows),
    });
  }

  const rows = analysis?.rows ?? [];
  const abuserRowCount = rows.filter((row) => row.isAbuser).length;
  const discoveryTypeRowCount = rows.filter((row) => row.isDiscoveryType).length;
  const filteredRows = rows.filter((row) => {
    if (excludeAbuser && row.isAbuser) return false;
    if (excludeDiscoveryType && row.isDiscoveryType) return false;
    return true;
  });
  const filteredOutCount = rows.length - filteredRows.length;
  const visibleReport = buildReport(filteredRows);
  const targetCountTone =
    filteredRows.length >= 40
      ? "is-good"
      : filteredRows.length >= 35
        ? "is-warn"
        : "is-danger";
  const targetCountMessage =
    targetCountTone === "is-good"
      ? "표본수가 충분해요!"
      : targetCountTone === "is-warn"
        ? "표본수가 조금 부족해요"
        : "표본수가 부족해요!";
  const isStep1Done = uploadFile !== null;
  const isStep2Done = criteria.trim().length > 0;
  const isStep3Done = coreValue.trim().length > 0;
  const isStep4Done = true;
  const canRunClassification = isStep1Done && isStep2Done && isStep3Done;
  const totalTableColumns = 2 + BASE_COLUMNS.length + 1;

  return (
    <div className="page">
      <div className="bg-grid" />
      <header className="hero reveal r1">
        <p className="hero-kicker">PRE-VD CLASSIFIER ADMIN</p>
        <h1>Pre-VD 판별기</h1>
        <p className="hero-sub">
          CSV 업로드 → 분류 기준 작성 → 서비스 핵심가치 작성 → 제외 조건 설정 후 자동 판별
        </p>
      </header>

      <section className="workflow reveal r2">
        <div className={`step-card${isStep1Done ? " is-done" : ""}`}>
          <div className="step-head">
            <div className="step-index">STEP 1</div>
            <div className={`step-check${isStep1Done ? " done" : ""}`}>
              {isStep1Done ? "✓ 완료" : "미완료"}
            </div>
          </div>
          <h3>CSV 업로드</h3>
          <div
            className={`upload-dropzone${isDragOver ? " is-dragover" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              id="csv-file-input"
              className="sr-only-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileInputChange}
            />
            <div className="upload-arrow" aria-hidden="true">
              ↑
            </div>
            <p>CSV 파일을 드래그앤드롭 하거나</p>
            <label htmlFor="csv-file-input" className="dropzone-btn">
              파일 선택
            </label>
            <p className="upload-file-name">
              {uploadFile ? `선택됨: ${uploadFile.name}` : "선택된 파일 없음"}
            </p>
          </div>
          <label className="field-label">교차검증하는 AI 수</label>
          <input
            type="number"
            min={1}
            max={7}
            value={sampleCount}
            onChange={(e) => setSampleCount(clampNumberInput(e.target.value, 3, 1, 7))}
          />
          <label className="field-label">병렬 행 처리 개수</label>
          <input
            type="number"
            min={1}
            max={10}
            value={rowConcurrency}
            onChange={(e) => setRowConcurrency(clampNumberInput(e.target.value, 4, 1, 10))}
          />
          <p className="field-help">
            병렬 개수가 클수록 빨리 끝나지만 정확도는 감소할 수 있습니다.
          </p>
          <div className="recommended-ops">
            <div className="recommended-ops-title">권장 운영값</div>
            <div className="recommended-ops-grid">
              <div className="recommended-ops-item">
                <span>교차검증 AI</span>
                <strong>3 (최대 7)</strong>
              </div>
              <div className="recommended-ops-item">
                <span>병렬 행 처리</span>
                <strong>4 (최대 10)</strong>
              </div>
            </div>
          </div>
        </div>

        <div className={`step-card${isStep2Done ? " is-done" : ""}`}>
          <div className="step-head">
            <div className="step-index">STEP 2</div>
            <div className={`step-check${isStep2Done ? " done" : ""}`}>
              {isStep2Done ? "✓ 완료" : "미완료"}
            </div>
          </div>
          <h3>분류 기준 작성</h3>
          {isCriteriaEditing || !criteria.trim() ? (
            <>
              <textarea
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                placeholder="예: 맞춤점수 8점 이상 + 구매의향이 강하면 Pre-VD 우선"
              />
              <div className="edit-actions">
                <button type="button" onClick={saveCriteria}>
                  저장
                </button>
              </div>
            </>
          ) : (
            <div className="saved-panel">
              <div className="saved-label">저장됨</div>
              <p className="saved-content">{criteria}</p>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setIsCriteriaEditing(true)}
              >
                편집
              </button>
            </div>
          )}
        </div>

        <div className={`step-card${isStep3Done ? " is-done" : ""}`}>
          <div className="step-head">
            <div className="step-index">STEP 3</div>
            <div className={`step-check${isStep3Done ? " done" : ""}`}>
              {isStep3Done ? "✓ 완료" : "미완료"}
            </div>
          </div>
          <h3>서비스 핵심가치 작성</h3>
          {isCoreValueEditing || !coreValue.trim() ? (
            <>
              <textarea
                value={coreValue}
                onChange={(e) => setCoreValue(e.target.value)}
                placeholder="예: 사용자의 피부/취향을 정확히 이해해 신뢰할 수 있는 구매 결정을 돕는다."
              />
              <div className="edit-actions">
                <button type="button" onClick={saveCoreValue}>
                  저장
                </button>
              </div>
            </>
          ) : (
            <div className="saved-panel">
              <div className="saved-label">저장됨</div>
              <p className="saved-content">{coreValue}</p>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setIsCoreValueEditing(true)}
              >
                편집
              </button>
            </div>
          )}
        </div>

        <div className={`step-card${isStep4Done ? " is-done" : ""}`}>
          <div className="step-head">
            <div className="step-index">STEP 4</div>
            <div className={`step-check${isStep4Done ? " done" : ""}`}>
              {isStep4Done ? "옵션 설정" : "선택"}
            </div>
          </div>
          <h3>제외 조건 설정 (옵션)</h3>
          <p className="field-help">
            비워두면 기본 로직으로 동작합니다. 분류 완료 후 탭에서 제거해서 결과를 볼 수
            있습니다.
          </p>

          <label className="field-label">어뷰저 조건 (자연어)</label>
          {isAbuserCriteriaEditing ? (
            <>
              <textarea
                value={abuserCriteria}
                onChange={(e) => setAbuserCriteria(e.target.value)}
                placeholder="어뷰저 판정 기준을 입력하세요."
              />
              <div className="edit-actions">
                <button type="button" onClick={saveAbuserCriteria}>
                  저장
                </button>
              </div>
            </>
          ) : (
            <div className="saved-panel">
              <div className="saved-label">저장됨</div>
              <p className="saved-content">
                {abuserCriteria.trim() || "(비워둠: 기본 어뷰저 기준 사용)"}
              </p>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setIsAbuserCriteriaEditing(true)}
              >
                편집
              </button>
            </div>
          )}

          <label className="field-label">디스커버리형 조건 (자연어)</label>
          {isDiscoveryCriteriaEditing ? (
            <>
              <textarea
                value={discoveryCriteria}
                onChange={(e) => setDiscoveryCriteria(e.target.value)}
                placeholder="디스커버리형 판정 기준을 입력하세요."
              />
              <div className="edit-actions">
                <button type="button" onClick={saveDiscoveryCriteria}>
                  저장
                </button>
              </div>
            </>
          ) : (
            <div className="saved-panel">
              <div className="saved-label">저장됨</div>
              <p className="saved-content">
                {discoveryCriteria.trim() || "(비워둠: 기본 디스커버리형 기준 사용)"}
              </p>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setIsDiscoveryCriteriaEditing(true)}
              >
                편집
              </button>
            </div>
          )}
          <button
            className="run-button"
            onClick={handleUploadAndClassify}
            disabled={loading || !canRunClassification}
          >
            {loading ? "분류 실행 중..." : "분류 실행"}
          </button>
        </div>
      </section>

      {progress.totalRows > 0 && (
        <section className="status-panel reveal r3">
          <h3>실시간 진행 상황</h3>
          <div className="progress-meta">{progress.message}</div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="progress-meta">
            {progress.processedRows}/{progress.totalRows} ({progress.percent.toFixed(1)}%)
          </div>
        </section>
      )}

      {analysis && (
        <>
          <section className="analysis-filter-tabs reveal r4">
            <div className={`analysis-target-count ${targetCountTone}`}>
              분석대상 총 {filteredRows.length}명
              <span className={`analysis-target-badge ${targetCountTone}`}>
                {targetCountMessage}
              </span>
            </div>
            <div className="analysis-tab-buttons">
              <button
                type="button"
                className={`analysis-filter-tab${excludeAbuser ? " is-active" : ""}`}
                onClick={() => setExcludeAbuser((prev) => !prev)}
              >
                어뷰저 제거
                {excludeAbuser ? ` (${abuserRowCount}명 제거됨)` : ""}
              </button>
              <button
                type="button"
                className={`analysis-filter-tab${excludeDiscoveryType ? " is-active" : ""}`}
                onClick={() => setExcludeDiscoveryType((prev) => !prev)}
              >
                디스커버리형 제거
                {excludeDiscoveryType ? ` (${discoveryTypeRowCount}명 제거됨)` : ""}
              </button>
            </div>
            <span className="analysis-filter-meta">
              {filteredOutCount > 0 ? `총 ${filteredOutCount}명 제외됨` : "제외된 응답 없음"}
            </span>
          </section>

          <section className="stats reveal r4">
            {LABEL_ORDER.map((label) => (
              <div key={label} className="stat">
                <div className="lb">{LABEL_VIEW[label]}</div>
                <div className="num">{visibleReport.byLabel[label]?.count ?? 0}</div>
                <div className="pc">{visibleReport.byLabel[label]?.percent ?? 0}%</div>
              </div>
            ))}
          </section>
        </>
      )}

      {error ? <div className="error reveal r4">{error}</div> : null}

      <section className="table-wrap reveal r5">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>분류</th>
              {BASE_COLUMNS.map((col) => (
                <th key={col.id} className={col.className}>
                  {col.label}
                </th>
              ))}
              <th className="th-edit">수정</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <Fragment key={row.id}>
                <tr className={labelRowClass(row.finalLabel)}>
                  <td className="index-cell">
                    <div className="index-stack">
                      <span className="index-number">{row.rowIndex}</span>
                      {expandedRawRowId === row.id ? null : (
                        <button
                          className="secondary-btn row-raw-btn"
                          onClick={() => setExpandedRawRowId(row.id)}
                        >
                          원본 보기
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {LABEL_VIEW[row.finalLabel]}
                    {row.isAbuser ? <span className="row-flag row-flag-abuser">어뷰저</span> : null}
                  </td>
                  {BASE_COLUMNS.map((col) => {
                    const rawValue = resolveValue(row, col.id);
                    let value = `${rawValue ?? ""}`;
                    let toneClass = "";
                    let coreValueStatus = "";
                    let coreValueReason = "";
                    if (col.id === "confidence" && typeof rawValue === "number") {
                      value = `${(rawValue * 100).toFixed(1)}%`;
                    } else if (col.id === "coreValueUnderstood") {
                      coreValueStatus =
                        rawValue === true ? "이해함" : rawValue === false ? "미이해" : "";
                      coreValueReason = `${row.coreValueReason ?? ""}`.trim();
                      value = coreValueReason
                        ? `${coreValueStatus}\n근거: ${coreValueReason}`
                        : coreValueStatus;
                    } else if (col.id === "fitScore") {
                      if (typeof rawValue === "number" && rawValue >= 4) {
                        toneClass = "cell-tone-green";
                      }
                    } else if (col.id === "pmf") {
                      const pmfText = `${rawValue ?? ""}`.trim();
                      if (pmfText.includes("매우")) toneClass = "cell-tone-green";
                      else if (pmfText.includes("조금")) toneClass = "cell-tone-yellow";
                      else if (pmfText.includes("별로") || pmfText.includes("아쉽지")) {
                        toneClass = "cell-tone-red";
                      }
                    }

                    return (
                      <td
                        key={`${row.id}-${col.id}`}
                        className={`${col.className}${col.id === "rationale" ? " rationale" : ""}${toneClass ? ` ${toneClass}` : ""}`}
                      >
                        {col.id === "coreValueUnderstood" ? (
                          <div className="core-value-cell">
                            <span
                              className={`core-value-tag${rawValue === true ? " is-understood" : rawValue === false ? " is-not-understood" : ""}`}
                            >
                              {coreValueStatus || "-"}
                            </span>
                            {coreValueReason ? (
                              <div className="core-value-reason">근거: {coreValueReason}</div>
                            ) : null}
                          </div>
                        ) : col.id === "purchaseTiming" ? (
                          <div className="purchase-timing-cell">
                            {row.isDiscoveryType ? (
                              <span className="row-flag row-flag-discovery">디스커버리형</span>
                            ) : null}
                            <span>{value || "-"}</span>
                          </div>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                  <td className="td-edit">
                    <div className="edit-stack">
                      <select
                        value={editLabelById[row.id] ?? row.finalLabel}
                        onChange={(e) =>
                          setEditLabelById((prev) => ({
                            ...prev,
                            [row.id]: e.target.value as ClassificationLabel,
                          }))
                        }
                      >
                        {LABEL_ORDER.map((label) => (
                          <option key={label} value={label}>
                            {LABEL_VIEW[label]}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="수정 사유 (선택)"
                        value={editReasonById[row.id] ?? ""}
                        onChange={(e) =>
                          setEditReasonById((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }))
                        }
                      />
                      <button onClick={() => saveManualEdit(row)}>저장</button>
                    </div>
                  </td>
                </tr>
                {expandedRawRowId === row.id && (
                  <tr className="raw-detail-row">
                    <td colSpan={totalTableColumns} className="raw-detail-cell">
                      <div className="raw-detail-inner">
                        <div className="raw-detail-head">
                          <span>#{row.rowIndex} 원본 응답 전체</span>
                          <button
                            className="secondary-btn raw-close-btn"
                            onClick={() => setExpandedRawRowId(null)}
                          >
                            닫기
                          </button>
                        </div>
                        <div className="raw-grid">
                          {(row.rawEntries?.length
                            ? row.rawEntries.map((entry) => ({
                                key: entry.header || `column_${entry.columnIndex + 1}`,
                                value: entry.value,
                              }))
                            : Object.entries(row.rawData).map(([key, value]) => ({ key, value }))
                          ).map((item, index) => (
                            <div className="raw-item" key={`${row.id}-raw-${item.key}-${index}`}>
                              <div className="raw-key">{item.key}</div>
                              <div className="raw-value">{item.value || "-"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
