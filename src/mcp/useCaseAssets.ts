import {pointers, publicPointer} from '../backend/dal/use-case-asset-pointer.dal';
import {projectImplementation} from '../backend/services/assetLinks.service';
import {reviewedPublicAsset, assetEnvironmentWarnings} from '../domain/publicUseCaseAssets';

export function publicUseCaseAssets(projectId: string, useCaseId: string) {
  const reviewed = projectImplementation(projectId).use_cases.find(r => r.use_case_id === useCaseId)?.assets ?? [];
  const assets = [...reviewed.map(reviewedPublicAsset), ...pointers(projectId, useCaseId).map(publicPointer)];
  return {assets, warnings: assetEnvironmentWarnings(assets)};
}
