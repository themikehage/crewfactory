import { useLiterals } from "@/lib";
import { literals as u } from "./AvatarUploadField.literals";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { DEFAULT_AVATARS } from "@/lib/defaultAvatars";

interface AvatarUploadFieldProps {
  preview: string | null;
  selectedDefault: string | null;
  onFileChange: (file: File | null, preview: string | null) => void;
  onSelectDefault: (id: string) => void;
  onClear: () => void;
  entityName: string;
  avatarType?: "agent" | "entity";
  entityAvatarEntityType?: "project" | "team" | "channel";
}

export function AvatarUploadField({
  preview,
  selectedDefault,
  onFileChange,
  onSelectDefault,
  onClear,
  entityName,
  avatarType = "agent",
  entityAvatarEntityType = "project",
}: AvatarUploadFieldProps) {
  const l = useLiterals(u);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const url = URL.createObjectURL(file);
      onFileChange(file, url);
    } else {
      onFileChange(null, null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {avatarType === "agent" ? (
          <AgentAvatar
            name={entityName || "Agent"}
            avatarUrl={preview}
            size="lg"
          />
        ) : (
          <EntityAvatar
            name={entityName || "Entity"}
            avatarUrl={preview}
            size="lg"
            type={entityAvatarEntityType}
          />
        )}
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground block mb-1">{l.avatarLabel}</label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-card-hover file:text-foreground hover:file:bg-card-hover/80 file:cursor-pointer"
            />
            {preview && (
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-destructive hover:underline cursor-pointer"
              >
                {l.removeButton}
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-2">{l.defaultAvatarsLabel}</label>
        <div className="grid grid-cols-8 gap-1.5">
          {DEFAULT_AVATARS.map((av) => {
            const AvComp = av.component;
            const isSelected = selectedDefault === av.id;
            return (
              <button
                key={av.id}
                type="button"
                onClick={() => onSelectDefault(av.id)}
                className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary scale-110"
                    : "border-transparent hover:border-primary/40"
                }`}
                title={av.label}
              >
                <AvComp width={32} height={32} viewBox="0 0 40 40" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
