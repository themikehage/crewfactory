import { useState, useEffect, useCallback, useMemo } from "react";
import { WorkspaceFileTree } from "./WorkspaceFileTree";
import { WorkspaceFileEditor } from "./WorkspaceFileEditor";
import type { FileInfo } from "shared";

interface Props {
  activeRepoName: string | null;
  activeAgentId?: string | null;
  activeChannelId?: string | null;
}

export function WorkspacePanel({ activeRepoName, activeAgentId = null, activeChannelId = null }: Props) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [pathContents, setPathContents] = useState<Record<string, FileInfo[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingRootType, setAddingRootType] = useState<"file" | "folder" | null>(null);

  // Helper centralizado para construir las URLs con scoping de repositorio/agente/canal
  const getWorkspaceUrl = useCallback((path: string) => {
    const base = `/api/workspace/${path}`;
    const params = new URLSearchParams();
    if (activeRepoName) params.append("repo", activeRepoName);
    if (activeAgentId) params.append("agentId", activeAgentId);
    if (activeChannelId) params.append("channelId", activeChannelId);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }, [activeRepoName, activeAgentId, activeChannelId]);

  // Helper for auth headers
  const getHeaders = useCallback(() => {
    const token = localStorage.getItem("token") || "";
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, []);

  // Fetch file or folder contents
  const loadWorkspace = useCallback(
    async (path = "") => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(getWorkspaceUrl(path), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.isDirectory) {
          if (path === "") {
            setFiles(data.children || []);
          } else {
            setPathContents((prev) => ({
              ...prev,
              [path]: data.children || [],
            }));
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load workspace");
      } finally {
        setLoading(false);
      }
    },
    [getWorkspaceUrl]
  );

  // Initial load
  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Full workspace reload (root + all expanded subdirectories)
  const reloadWorkspace = useCallback(async () => {
    await loadWorkspace("");
    const paths = Array.from(expandedPaths);
    for (const path of paths) {
      await loadWorkspace(path);
    }
  }, [expandedPaths, loadWorkspace]);

  // Listen for agent workspaceUpdated notifications to reload automatically
  useEffect(() => {
    window.addEventListener("workspaceUpdated", reloadWorkspace);
    return () => {
      window.removeEventListener("workspaceUpdated", reloadWorkspace);
    };
  }, [reloadWorkspace]);

  // Handle expanding/collapsing folders
  const handleToggleExpand = useCallback(
    async (path: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          if (!pathContents[path]) {
            loadWorkspace(path);
          }
        }
        return next;
      });
    },
    [pathContents, loadWorkspace]
  );

  // Handle file select
  const handleSelectFile = useCallback(
    async (file: FileInfo) => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(getWorkspaceUrl(file.path), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setSelectedFile(data);
      } catch (err: any) {
        setError(err.message || "Failed to open file");
      } finally {
        setLoading(false);
      }
    },
    [getWorkspaceUrl]
  );

  // Listen for file-click events from Chat messages to open files in editor
  useEffect(() => {
    const handleOpenFile = (e: Event) => {
      const customEvt = e as CustomEvent<{ path: string }>;
      const targetPath = customEvt.detail.path;
      if (targetPath) {
        if (targetPath.includes("/")) {
          const parts = targetPath.split("/");
          let current = "";
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            for (let i = 0; i < parts.length - 1; i++) {
              current = current ? `${current}/${parts[i]}` : parts[i];
              next.add(current);
              if (!pathContents[current]) {
                loadWorkspace(current);
              }
            }
            return next;
          });
        }

        handleSelectFile({
          name: targetPath.split("/").pop() || "",
          path: targetPath,
          isDirectory: false,
          size: 0,
          lastModified: new Date().toISOString(),
        });
      }
    };
    window.addEventListener("openWorkspaceFile", handleOpenFile);
    return () => {
      window.removeEventListener("openWorkspaceFile", handleOpenFile);
    };
  }, [pathContents, loadWorkspace, handleSelectFile]);

  // Save modified text file content
  const handleSaveFile = useCallback(
    async (path: string, content: string) => {
      const res = await fetch(getWorkspaceUrl(path), {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ type: "file", content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save operation failed");
      }
      const data = await res.json();
      setSelectedFile(data);
    },
    [getHeaders, getWorkspaceUrl]
  );

  // Create new file or folder
  const handleCreate = useCallback(
    async (parentPath: string, name: string, type: "file" | "folder") => {
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      try {
        const res = await fetch(getWorkspaceUrl(fullPath), {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify({ type }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to create resource");
        }
        await loadWorkspace(parentPath);
        if (parentPath !== "") {
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            next.add(parentPath);
            return next;
          });
        }
      } catch (err: any) {
        setError(err.message || "Create failed");
      }
    },
    [getHeaders, loadWorkspace, getWorkspaceUrl]
  );

  // Rename file or folder
  const handleRename = useCallback(
    async (oldPath: string, newPath: string) => {
      try {
        const res = await fetch(getWorkspaceUrl(oldPath), {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({ newPath }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to rename resource");
        }
        const parentOfOld = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
        const parentOfNew = newPath.includes("/") ? newPath.substring(0, newPath.lastIndexOf("/")) : "";
        await loadWorkspace(parentOfOld);
        if (parentOfNew !== parentOfOld) {
          await loadWorkspace(parentOfNew);
        }
        if (selectedFile?.path === oldPath) {
          const data = await res.json();
          setSelectedFile(data);
        }
      } catch (err: any) {
        setError(err.message || "Rename failed");
      }
    },
    [getHeaders, selectedFile, loadWorkspace, getWorkspaceUrl]
  );

  // Delete file or folder
  const handleDelete = useCallback(
    async (path: string) => {
      if (!confirm(`Are you sure you want to delete this ${path.split("/").pop()}?`)) return;
      try {
        const res = await fetch(getWorkspaceUrl(path), {
          method: "DELETE",
          headers: getHeaders(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to delete resource");
        }
        const parentPath = path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "";
        await loadWorkspace(parentPath);
        if (selectedFile?.path === path) {
          setSelectedFile(null);
        }
      } catch (err: any) {
        setError(err.message || "Delete failed");
      }
    },
    [getHeaders, selectedFile, loadWorkspace, getWorkspaceUrl]
  );

  // Filter files based on search query recursively or at root level
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const query = searchQuery.toLowerCase();
    const filterRecurse = (items: FileInfo[]): FileInfo[] => {
      return items
        .map((item) => {
          if (item.isDirectory) {
            const childrenKey = item.path;
            const children = pathContents[childrenKey] || [];
            const filteredChildren = filterRecurse(children);
            if (filteredChildren.length > 0 || item.name.toLowerCase().includes(query)) {
              return {
                ...item,
                children: filteredChildren,
              };
            }
          } else if (item.name.toLowerCase().includes(query)) {
            return item;
          }
          return null;
        })
        .filter(Boolean) as FileInfo[];
    };
    return filterRecurse(files);
  }, [files, pathContents, searchQuery]);

  return (
    <div className="w-full h-full flex flex-col bg-card overflow-hidden border-l border-border select-none">
      {error && (
        <div className="px-3 py-1.5 bg-destructive/10 border-b border-error/20 text-destructive text-[10px] flex items-center justify-between flex-shrink-0">
          <span className="truncate">{error}</span>
          <button onClick={() => setError(null)} className="underline cursor-pointer flex-shrink-0 ml-2">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        <div className="w-full md:w-64 lg:w-64 border-b md:border-b-0 md:border-r border-border flex flex-col overflow-hidden p-3 bg-card/20 flex-shrink-0 min-h-[250px] md:min-h-0 md:h-full">
          <div className="mb-2.5 flex-shrink-0">
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-input hover:border-primary/40 focus:border-primary outline-none text-foreground px-2.5 py-1 rounded text-xs transition-all font-sans"
            />
          </div>

          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50 flex-shrink-0 text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider font-semibold">Files</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => loadWorkspace("")}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-surfaceHover/50 rounded transition-colors cursor-pointer"
                title="Refresh Root"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.259.627 5.002 5.002 0 009.23 1.316H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                onClick={() => setAddingRootType("file")}
                className="p-1 text-muted-foreground hover:text-primary rounded transition-colors cursor-pointer"
                title="New File in Root"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6z" />
                  <path
                    fillRule="evenodd"
                    d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                onClick={() => setAddingRootType("folder")}
                className="p-1 text-muted-foreground hover:text-warning rounded transition-colors cursor-pointer"
                title="New Folder in Root"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && files.length === 0 ? (
              <div className="h-24 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <WorkspaceFileTree
                files={filteredFiles}
                selectedPath={selectedFile?.path || null}
                onSelectFile={handleSelectFile}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                onDelete={handleDelete}
                onRename={handleRename}
                onCreate={handleCreate}
                pathContents={pathContents}
                addingRootType={addingRootType}
                onCancelAddingRoot={() => setAddingRootType(null)}
              />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-background h-full">
          <WorkspaceFileEditor
            file={selectedFile}
            activeRepoName={activeRepoName}
            activeAgentId={activeAgentId}
            activeChannelId={activeChannelId}
            onSave={handleSaveFile}
          />
        </div>
      </div>
    </div>
  );
}
