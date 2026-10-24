export {
  APPLICATION_STATUSES,
  APPLICATION_STAGES,
  getStatusMeta,
  getStatusText,
  getStageIndex,
  isApplicationStatus,
  isFinalStatus,
  canTransition,
} from './model/status';
export type {
  ApplicationStatus,
  ApplicationStageId,
  StatusAudience,
  StatusActor,
  StatusMeta,
} from './model/status';

export { PIPELINE_STAGES, getPipelineIndex, hasDecision, isClosingStage } from './model/pipeline';
export type { PipelineStageId } from './model/pipeline';

export {
  PRODUCTS,
  PRODUCT_CODES,
  PURPOSE_LABEL,
  TAX_SYSTEM_LABEL,
  TAX_SYSTEMS_BY_FORM,
  COLLATERAL_LABEL,
  MARITAL_LABEL,
  LEGAL_FORM_LABEL,
  DECISION_LABEL,
  DECISION_RESULT_LABEL,
  DECISION_TONE,
  RISK_LABEL,
  RISK_TONE,
  REJECT_REASON_LABEL,
} from './model/dictionaries';
export type { ProductInfo } from './model/dictionaries';

export type {
  ProductCode,
  LoanPurpose,
  TaxSystem,
  MaritalStatus,
  CollateralType,
  Founder,
  LoanSection,
  CompanySection,
  FinanceSection,
  ContactsSection,
  ConsentsSection,
  ApplicationForm,
  FieldPath,
  ApplicationDraft,
  DraftPreset,
  DraftSummary,
  RequestedTerms,
  LoanTerms,
  DecisionKind,
  ClientRejectReason,
  ClientDecision,
  StatusHistoryItem,
  ApplicationSummary,
  SigningDocument,
  SigningInfo,
  ClientApplication,
} from './model/types';

export type {
  RiskLevel,
  RejectReasonCode,
  RegistryData,
  CreditBureauData,
  TaxData,
  TurnoverMonth,
  TurnoverData,
  CheckLevel,
  EnrichmentCheck,
  Enrichment,
  ScoringFactor,
  Recommendation,
  Scoring,
  ActorType,
  Actor,
  AuditEntry,
  BankDecision,
  BankApplication,
  BankQueueItem,
  QueueStatusFilter,
  BankQueueFilters,
  BankQueueResponse,
  BankDecisionRequest,
} from './model/bank';

export { getClientApplicationLink } from './lib/clientLink';

export { applicationApi } from './api/applicationApi';
export { bankApplicationApi } from './api/bankApplicationApi';

export { StatusBadge } from './ui/StatusBadge/StatusBadge';
export type { StatusBadgeProps } from './ui/StatusBadge/StatusBadge';
export { StatusLegend } from './ui/StatusLegend/StatusLegend';
export { ApplicationFormView } from './ui/ApplicationFormView/ApplicationFormView';
export type { ApplicationFormViewProps, FormViewSection } from './ui/ApplicationFormView/ApplicationFormView';
