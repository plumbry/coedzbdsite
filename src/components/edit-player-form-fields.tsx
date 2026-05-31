import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

export type EditPlayerFormValues = {
  discordUsername: string;
  nickname: string;
  epicUsername: string;
  epicId: string;
  twitterUsername: string;
  twitchUsername: string;
  youtubeUsername: string;
  adminComments: string;
  discordUserId: string;
  serverJoinDate: string;
};

type FieldKey = keyof EditPlayerFormValues;

type EditPlayerFormFieldsProps = {
  values: EditPlayerFormValues;
  onChange: (field: FieldKey, value: string) => void;
  showIdentity?: boolean;
  showEpic?: boolean;
  showEpicId?: boolean;
  showSocial?: boolean;
  showDiscordUserId?: boolean;
  showServerJoinDate?: boolean;
  showAdminComments?: boolean;
};

export function EditPlayerFormFields({
  values,
  onChange,
  showIdentity = true,
  showEpic = true,
  showEpicId = false,
  showSocial = true,
  showDiscordUserId = false,
  showServerJoinDate = false,
  showAdminComments = true,
}: EditPlayerFormFieldsProps) {
  return (
    <div className="space-y-4">
      {showIdentity && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-discord-username">Discord Username *</Label>
            <Input
              id="edit-discord-username"
              value={values.discordUsername}
              onChange={(e) => onChange("discordUsername", e.target.value)}
              placeholder="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-nickname">Nickname (Display Name)</Label>
            <Input
              id="edit-nickname"
              value={values.nickname}
              onChange={(e) => onChange("nickname", e.target.value)}
              placeholder="Optional nickname"
            />
          </div>
        </div>
      )}

      {(showEpic || showDiscordUserId) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showEpic && (
            <div className="space-y-2">
              <Label htmlFor="edit-epic-username">Epic Username *</Label>
              <Input
                id="edit-epic-username"
                value={values.epicUsername}
                onChange={(e) => onChange("epicUsername", e.target.value)}
                placeholder="Epic Games username"
              />
            </div>
          )}

          {showEpic && showEpicId && (
            <div className="space-y-2">
              <Label htmlFor="edit-epic-id">Epic ID</Label>
              <Input
                id="edit-epic-id"
                value={values.epicId}
                onChange={(e) => onChange("epicId", e.target.value)}
                placeholder="Optional Epic account ID"
              />
            </div>
          )}

          {showDiscordUserId && (
            <div className="space-y-2">
              <Label htmlFor="edit-discord-user-id">Discord User ID *</Label>
              <Input
                id="edit-discord-user-id"
                value={values.discordUserId}
                onChange={(e) => onChange("discordUserId", e.target.value)}
                placeholder="123456789012345678"
              />
            </div>
          )}
        </div>
      )}

      {showServerJoinDate && (
        <div className="space-y-2">
          <Label htmlFor="edit-server-join-date">Server Join Date</Label>
          <Input
            id="edit-server-join-date"
            type="date"
            value={values.serverJoinDate.split("T")[0]}
            onChange={(e) => onChange("serverJoinDate", new Date(e.target.value).toISOString())}
          />
        </div>
      )}

      {showSocial && (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Social Media (Optional)</Label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="edit-twitter" className="text-xs">
                Twitter/X
              </Label>
              <Input
                id="edit-twitter"
                value={values.twitterUsername}
                onChange={(e) => onChange("twitterUsername", e.target.value)}
                placeholder="@username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-twitch" className="text-xs">
                Twitch
              </Label>
              <Input
                id="edit-twitch"
                value={values.twitchUsername}
                onChange={(e) => onChange("twitchUsername", e.target.value)}
                placeholder="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-youtube" className="text-xs">
                YouTube
              </Label>
              <Input
                id="edit-youtube"
                value={values.youtubeUsername}
                onChange={(e) => onChange("youtubeUsername", e.target.value)}
                placeholder="@username"
              />
            </div>
          </div>
        </div>
      )}

      {showAdminComments && (
        <div className="space-y-2">
          <Label htmlFor="edit-admin-comments">Admin Comments</Label>
          <Textarea
            id="edit-admin-comments"
            value={values.adminComments}
            onChange={(e) => onChange("adminComments", e.target.value)}
            placeholder="Internal notes (only visible to admins/moderators)"
            rows={3}
          />
        </div>
      )}
    </div>
  );
}
