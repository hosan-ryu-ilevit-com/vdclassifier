export type ClassificationLabel = "PRE_VD" | "VSD" | "NSD" | "ND";

export const LABEL_OPTIONS: ClassificationLabel[] = [
  "PRE_VD",
  "VSD",
  "NSD",
  "ND",
];

export const LABEL_VIEW: Record<ClassificationLabel, string> = {
  PRE_VD: "Pre-VD",
  VSD: "VSD",
  NSD: "NSD",
  ND: "ND",
};

export type NormalizedSurveyRow = {
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

export type ClassifierInput = {
  rowIndex: number;
  normalized: NormalizedSurveyRow;
  rawData: Record<string, string>;
  rawEntries?: Array<{
    header: string;
    value: string;
    columnIndex: number;
  }>;
  userCriteria?: string;
  coreValue?: string;
  abuserCriteria?: string;
  discoveryCriteria?: string;
};

export type ClassifierVote = {
  label: ClassificationLabel;
  rationale: string;
  warningSignals?: string[];
  usedColumns?: string[];
  isAbuser?: boolean | null;
  abuserReason?: string;
  coreValueUnderstood?: boolean | null;
  coreValueReason?: string;
};

export type ClassifierResult = {
  finalLabel: ClassificationLabel;
  confidence: number;
  rationale: string;
  warningSignals: string[];
  isAbuser: boolean;
  isDiscoveryType: boolean;
  normalizedData: NormalizedSurveyRow;
  usedColumns: string[];
  coreValueUnderstood: boolean | null;
  coreValueReason?: string;
  votes: ClassifierVote[];
  latencyMs: number;
};
