export function openInWorkspace(relativePath: string) {
  window.dispatchEvent(
    new CustomEvent("openWorkspaceFile", {
      detail: { path: relativePath.replace(/\/$/, "") },
    })
  );
}
