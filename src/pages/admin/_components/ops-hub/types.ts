export type OpsHubTabProps = {
  viewerToken?: string;
  canEdit?: boolean;
};

export function opsQueryArgs(viewerToken?: string) {
  return viewerToken ? { viewerToken } : {};
}

export function opsMutationArgs<T extends Record<string, unknown>>(
  viewerToken: string | undefined,
  fields: T,
) {
  return viewerToken ? { viewerToken, ...fields } : fields;
}
