import { useState, useCallback } from "react";
import type { FileInfo } from "shared";

interface FileTreeProps {
  files: FileInfo[];
  selectedPath: string | null;
  onSelectFile: (file: FileInfo) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onCreate: (parentPath: string, name: string, type: "file" | "folder") => void;
  pathContents: Record<string, FileInfo[]>;
  addingRootType: "file" | "folder" | null;
  onCancelAddingRoot: () => void;
}

interface TreeNodeProps {
  file: FileInfo;
  level: number;
  selectedPath: string | null;
  onSelectFile: (file: FileInfo) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onCreate: (parentPath: string, name: string, type: "file" | "folder") => void;
  pathContents: Record<string, FileInfo[]>;
}

function TreeNode({
  file,
  level,
  selectedPath,
  onSelectFile,
  expandedPaths,
  onToggleExpand,
  onDelete,
  onRename,
  onCreate,
  pathContents,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(file.path);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(file.name);
  const [addingType, setAddingType] = useState<"file" | "folder" | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(file.path);
    },
    [file.path, onToggleExpand]
  );

  const handleClick = useCallback(() => {
    if (file.isDirectory) {
      onToggleExpand(file.path);
    } else {
      onSelectFile(file);
    }
  }, [file, onToggleExpand, onSelectFile]);

  const handleRenameSubmit = () => {
    if (editName && editName !== file.name) {
      const parts = file.path.split("/");
      parts[parts.length - 1] = editName;
      const newPath = parts.join("/");
      onRename(file.path, newPath);
    }
    setIsEditing(false);
  };

  const handleCreateSubmit = () => {
    if (newItemName && addingType) {
      onCreate(file.path, newItemName, addingType);
      setNewItemName("");
      setAddingType(null);
    }
  };

  const getFileIcon = () => {
    if (file.isDirectory) {
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="text-warning flex-shrink-0"
        >
          {isExpanded ? (
            <path d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          ) : (
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          )}
        </svg>
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    let color = "text-muted-foreground";
    if (ext === "js" || ext === "jsx") color = "text-[#f1e05a]";
    else if (ext === "ts" || ext === "tsx") color = "text-[#3178c6]";
    else if (ext === "html") color = "text-[#e34c26]";
    else if (ext === "css") color = "text-[#563d7c]";
    else if (ext === "json") color = "text-primary";
    else if (ext === "md") color = "text-highlight";

    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`${color} flex-shrink-0`}
      >
        <path
          fillRule="evenodd"
          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6h8v2H6v-2zm0 4h8v2H6v-2zm0-8h4v2H6V6z"
          clipRule="evenodd"
        />
      </svg>
    );
  };

  return (
    <div className="select-none">
      <div
        className={`group flex items-center justify-between px-2 py-1 text-xs rounded hover:bg-surfaceHover/50 transition-colors cursor-pointer border border-transparent ${
          selectedPath === file.path
            ? "bg-surfaceHover border-primary/20 text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        style={{ paddingLeft: `${level * 12 + 6}px` }}
        onClick={handleClick}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {file.isDirectory ? (
            <button
              onClick={handleToggle}
              className="p-0.5 hover:bg-surfaceHover rounded transition-colors text-muted-foreground/50 hover:text-foreground flex-shrink-0 cursor-pointer"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transition-transform duration-150 ${
                  isExpanded ? "rotate-90" : ""
                }`}
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          ) : (
            <span className="w-[17px] flex-shrink-0" />
          )}

          {getFileIcon()}

          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setIsEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-background border border-primary/50 outline-none text-foreground px-1 rounded text-xs py-0.5"
              autoFocus
            />
          ) : (
            <span className="truncate flex-1 font-mono">{file.name}</span>
          )}
        </div>

        {/* Tree Node Actions */}
        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0 ml-1.5">
          {file.isDirectory && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(file.path);
                  setAddingType("file");
                }}
                className="p-1 text-muted-foreground hover:text-primary rounded transition-colors cursor-pointer"
                title="New File"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6z" />
                  <path
                    fillRule="evenodd"
                    d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(file.path);
                  setAddingType("folder");
                }}
                className="p-1 text-muted-foreground hover:text-warning rounded transition-colors cursor-pointer"
                title="New Folder"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="p-1 text-muted-foreground hover:text-primary rounded transition-colors cursor-pointer"
            title="Rename"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.829z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(file.path);
            }}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors cursor-pointer"
            title="Delete"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Adding items inline */}
      {file.isDirectory && isExpanded && addingType && (
        <div
          className="flex items-center gap-1.5 px-2 py-1"
          style={{ paddingLeft: `${(level + 1) * 12 + 18}px` }}
        >
          {addingType === "folder" ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="text-warning flex-shrink-0"
            >
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="text-muted-foreground flex-shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6h8v2H6v-2zm0 4h8v2H6v-2zm0-8h4v2H6V6z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onBlur={() => {
              // Wait slightly in case user clicked Enter
              setTimeout(() => setAddingType(null), 200);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateSubmit();
              if (e.key === "Escape") setAddingType(null);
            }}
            placeholder={`new ${addingType}...`}
            className="flex-1 min-w-0 bg-background border border-primary/50 outline-none text-foreground px-1 rounded text-xs py-0.5"
            autoFocus
          />
        </div>
      )}

      {/* Children Nodes */}
      {file.isDirectory && isExpanded && (
        <div className="overflow-hidden">
          {pathContents[file.path] && pathContents[file.path].length > 0 ? (
            pathContents[file.path].map((child) => (
              <TreeNode
                key={child.path}
                file={child}
                level={level + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                onDelete={onDelete}
                onRename={onRename}
                onCreate={onCreate}
                pathContents={pathContents}
              />
            ))
          ) : (
            <div
              className="text-[10px] text-muted-foreground/40 py-0.5 font-mono italic"
              style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
            >
              (empty folder)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkspaceFileTree({
  files,
  selectedPath,
  onSelectFile,
  expandedPaths,
  onToggleExpand,
  onDelete,
  onRename,
  onCreate,
  pathContents,
  addingRootType,
  onCancelAddingRoot,
}: FileTreeProps) {
  const [newRootName, setNewRootName] = useState("");

  const handleRootSubmit = () => {
    if (newRootName && addingRootType) {
      onCreate("", newRootName, addingRootType);
      setNewRootName("");
      onCancelAddingRoot();
    }
  };

  return (
    <div className="space-y-0.5 max-h-full overflow-y-auto pr-1">
      {addingRootType && (
        <div className="flex items-center gap-1.5 px-2 py-1 pl-6">
          {addingRootType === "folder" ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="text-warning flex-shrink-0"
            >
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="text-muted-foreground flex-shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6h8v2H6v-2zm0 4h8v2H6v-2zm0-8h4v2H6V6z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <input
            type="text"
            value={newRootName}
            onChange={(e) => setNewRootName(e.target.value)}
            onBlur={() => setTimeout(onCancelAddingRoot, 200)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRootSubmit();
              if (e.key === "Escape") onCancelAddingRoot();
            }}
            placeholder={`new ${addingRootType}...`}
            className="flex-1 min-w-0 bg-background border border-primary/50 outline-none text-foreground px-1 rounded text-xs py-0.5"
            autoFocus
          />
        </div>
      )}
      {files.map((file) => (
        <TreeNode
          key={file.path}
          file={file}
          level={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          expandedPaths={expandedPaths}
          onToggleExpand={onToggleExpand}
          onDelete={onDelete}
          onRename={onRename}
          onCreate={onCreate}
          pathContents={pathContents}
        />
      ))}
    </div>
  );
}
