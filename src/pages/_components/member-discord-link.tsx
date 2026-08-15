import { MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";

export function discordUserProfileUrl(discordUserId: string): string {
  return `https://discord.com/users/${discordUserId}`;
}

export default function MemberDiscordLink({
  discordUserId,
  displayName,
}: {
  discordUserId?: string;
  displayName: string;
}) {
  if (!discordUserId) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={discordUserProfileUrl(discordUserId)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message ${displayName} on Discord`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] touch-manipulation"
        >
          <MessageSquare className="size-4" />
        </a>
      </TooltipTrigger>
      <TooltipContent>Message on Discord</TooltipContent>
    </Tooltip>
  );
}
