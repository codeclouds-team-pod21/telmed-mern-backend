export type FunnelFlowStageKey =
  | 'general'
  | 'register'
  | 'vitals'
  | 'medical'
  | 'checkout';

type ConfigurableFunnelFlowStageKey = Exclude<FunnelFlowStageKey, 'checkout'>;

export const FUNNEL_FLOW_STAGE_ORDER: ConfigurableFunnelFlowStageKey[] = [
  'general',
  'register',
  'vitals',
  'medical',
];

export function getEnabledFunnelFlowStageKeys(options?: {
  hasVitalsQuestionnaire?: boolean;
  isSupplement?: boolean;
}) {
  const hasVitalsQuestionnaire = Boolean(options?.hasVitalsQuestionnaire);
  const isSupplement = Boolean(options?.isSupplement);

  return [
    ...FUNNEL_FLOW_STAGE_ORDER.filter((stageKey) => {
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
}) {
  const stageStatus: Partial<Record<FunnelFlowStageKey, boolean>> = {
    vitals: Boolean(options.hasVitalsAnswer),
    medical: Boolean(options.hasMedicalAnswer),
  };

  return (
    getEnabledFunnelFlowStageKeys({
      hasVitalsQuestionnaire: options.hasVitalsQuestionnaire,
      isSupplement: options.isSupplement,
    }).find(
      (stageKey) =>
        (stageKey === 'vitals' || stageKey === 'medical') && !stageStatus[stageKey],
    ) ?? null
  );
}
