const workspaces = new Set<string>();

export function markWorkspaceUnsaved(workspace: string, unsaved: boolean) {
  if (unsaved) workspaces.add(workspace);
  else workspaces.delete(workspace);
}

export function unsavedWorkspaces() {
  return [...workspaces];
}
