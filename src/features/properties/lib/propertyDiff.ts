import type { Property } from '@/src/types';

type ComputePropertyDiffParams = {
  activeBranchId: string;
  activeBranch: any;
};

export function computePropertyDiff(
  params: ComputePropertyDiffParams,
): { newProps: Property[]; modifiedProps: Property[] } | null {
  const { activeBranchId, activeBranch } = params;

  if (activeBranchId === 'main' || !activeBranch) {
    return null;
  }

  const baseProps: Property[] = activeBranch.baseData.properties;
  const draftProps: Property[] = activeBranch.draftData.properties;

  const newProps = draftProps.filter(
    (dp) => !baseProps.find((bp) => bp.id === dp.id),
  );

  const modifiedProps = draftProps.filter((dp) => {
    const base = baseProps.find((bp) => bp.id === dp.id);
    if (!base) return false;
    return JSON.stringify(base) !== JSON.stringify(dp);
  });

  return { newProps, modifiedProps };
}

