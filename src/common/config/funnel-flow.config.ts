export type FunnelFlowStageKey =
  | 'general'
  | 'register'
  | 'vitals'
  | 'medical'
  | 'checkout';

type ConfigurableFunnelFlowStageKey = Exclude<FunnelFlowStageKey, 'checkout'>;

export const FUNNEL_FLOW_STAGE_ORDER: ConfigurableFunnelFlowStageKey[] = [
  'vitals',
  'register',
  'general',
  'medical',
];

function normalizeStageOrder(stageOrder?: Array<string | ConfigurableFunnelFlowStageKey>) {
  const allowed = new Set(FUNNEL_FLOW_STAGE_ORDER);
  const seen = new Set<ConfigurableFunnelFlowStageKey>();
  const normalized = (stageOrder ?? [])
    .map((entry) => String(entry ?? '').trim().toLowerCase())
    .filter((entry): entry is ConfigurableFunnelFlowStageKey => allowed.has(entry as ConfigurableFunnelFlowStageKey))
    .filter((entry) => {
      if (seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });

  for (const stage of FUNNEL_FLOW_STAGE_ORDER) {
    if (!seen.has(stage)) {
      normalized.push(stage);
      seen.add(stage);
    }
  }

  return normalized;
}

export function getEnabledFunnelFlowStageKeys(options?: {
  hasVitalsQuestionnaire?: boolean;
  isSupplement?: boolean;
  stageOrder?: Array<string | ConfigurableFunnelFlowStageKey>;
}) {
  const hasVitalsQuestionnaire = Boolean(options?.hasVitalsQuestionnaire);
  const isSupplement = Boolean(options?.isSupplement);
  const stageOrder = normalizeStageOrder(options?.stageOrder);

  return [
    ...stageOrder.filter((stageKey) => {
      if (stageKey === 'vitals') {
        return hasVitalsQuestionnaire;
      }

      if (stageKey === 'medical') {
        return !isSupplement;
      }

      return true;
    }),
    'checkout' as const,
  ];
}

export function getFirstPendingQuestionnaireStage(options: {
  hasVitalsQuestionnaire: boolean;
  hasVitalsAnswer?: boolean;
  hasMedicalAnswer?: boolean;
  isSupplement: boolean;
  stageOrder?: Array<string | ConfigurableFunnelFlowStageKey>;
}) {
  const stageStatus: Partial<Record<FunnelFlowStageKey, boolean>> = {
    vitals: Boolean(options.hasVitalsAnswer),
    medical: Boolean(options.hasMedicalAnswer),
  };

  return (
    getEnabledFunnelFlowStageKeys({
      hasVitalsQuestionnaire: options.hasVitalsQuestionnaire,
      isSupplement: options.isSupplement,
      stageOrder: options.stageOrder,
    }).find(
      (stageKey) =>
        (stageKey === 'vitals' || stageKey === 'medical') && !stageStatus[stageKey],
    ) ?? null
  );
}
