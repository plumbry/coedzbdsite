export type BotCommand = {
  name: string;
  description: string;
  usage?: string;
  subcommands?: { name: string; description: string }[];
};

export type BotCommandCategory = {
  id: string;
  label: string;
  description: string;
  commands: BotCommand[];
};

export const BOT_COMMAND_CATEGORIES: BotCommandCategory[] = [
  {
    id: "events",
    label: "Events & Signups",
    description: "Run events, manage signups, and post event-related messages.",
    commands: [
      {
        name: "gamecall",
        description: "Start a game call.",
        usage: "/gamecall code:<code> region:<region> role:<role> minutes:<minutes>",
      },
      {
        name: "calledit",
        description: "Edit the active game call.",
        usage: "/calledit action:<override|stop> code:<code>",
      },
      {
        name: "roletagged",
        description: "Give roles to tagged users from signups.",
        usage: "/roletagged role:<role> mode:<team size> reload:<bool> two_lobbies:<bool> max_signups:<n>",
      },
      {
        name: "roleuntagged",
        description: "Give a role to every @mentioned user in this channel (no team checks).",
        usage: "/roleuntagged role:<role>",
      },
      {
        name: "checkrules",
        description: "Check rules acknowledgement for signups in this channel.",
        usage: "/checkrules mode:<team size> reload:<bool> two_lobbies:<bool>",
      },
      {
        name: "teamnames",
        description: "List Discord usernames for all signups in this channel (tagged or plain names).",
        usage: "/teamnames mode:<team size> file:<bool>",
      },
      {
        name: "unreg",
        description: "Unregister a valid sign-up by team number.",
        usage: "/unreg team_number:<n> role:<role> notify:<bool> players:<list>",
      },
      {
        name: "disqualify",
        description: "Disqualify selected player(s) from a valid sign-up.",
        usage: "/disqualify team_number:<n> role:<role> players:<mentions or IDs> reason:<reason>",
      },
      {
        name: "lfg",
        description: "Collate today's LFG posts, skipping members who already have the signup role.",
        usage: "/lfg signup_role:<role> post:<bool>",
      },
      {
        name: "scrimremind",
        description: "Post a scrim signup reminder from a server scheduled event.",
        usage: "/scrimremind event:<event> mode:<mode> category:<category> schedule:<when> ping_everyone:<bool>",
      },
      {
        name: "scrimdashboard",
        description: "Manage the permanent scrim operations dashboard.",
        subcommands: [
          { name: "setup", description: "Create or repair the permanent dashboard message." },
          { name: "set", description: "Set the active scrim category and role." },
          { name: "refresh", description: "Refresh channel resolution and dashboard message." },
        ],
      },
      {
        name: "spin",
        description: "Import scrim signups into a website spin event.",
        usage: "/spin code:<event code>",
      },
      {
        name: "rules",
        description: "Post and manage event rules plus banned items.",
        subcommands: [
          { name: "form", description: "Post rules for a scheduled event (ephemeral setup)." },
          { name: "bans", description: "Edit the ban list on a channel where rules were posted." },
        ],
      },
      {
        name: "bans",
        description: "Post or edit a bans-only message without full rules text.",
        subcommands: [
          { name: "post", description: "Post a banned-items message in the current channel." },
          { name: "edit", description: "Edit the ban list where bans were posted (this channel)." },
        ],
      },
      {
        name: "dropmap",
        description: "Post dropmap closure message.",
      },
      {
        name: "dropmapcheck",
        description: "Check which signup teams have at least one member who typed in dropmap.",
        usage: "/dropmapcheck signup_channel:<channel>",
      },
    ],
  },
  {
    id: "moderation",
    label: "Moderation & Bans",
    description: "Discipline, event bans, chat controls, and member lookups.",
    commands: [
      {
        name: "eventban",
        description: "Manage event ban and probation roles synced from coedzbd.com.",
        subcommands: [
          { name: "sync", description: "Poll pending role syncs from the API and apply Discord roles now." },
          { name: "summary", description: "Show active bans and probations from the Event Bans sheet." },
          { name: "status", description: "Show sheet status for one user." },
        ],
      },
      {
        name: "whois",
        description: "View moderation-relevant info about a user.",
        usage: "/whois user:<user>",
      },
      {
        name: "checkbannedplayers",
        description: "Check if signed up players have the Event Ban role.",
      },
      {
        name: "fixbans",
        description: "Repair event ban messages from the sheet.",
      },
      {
        name: "ticket",
        description: "Open an In Game Report ticket via Ticket Tool (run from a staff channel).",
        usage: "/ticket user:<user> reason:<reason>",
      },
      {
        name: "report",
        description: "Send instructions for submitting a rule break report.",
      },
      {
        name: "verify",
        description: "Send the woman-verification message to a member.",
        usage: "/verify member:<user>",
      },
      {
        name: "chaton",
        description: "Enable chat for a role in the current channel.",
        usage: "/chaton role:<role>",
      },
      {
        name: "chatoff",
        description: "Disable chat permissions for a role in the current channel.",
        usage: "/chatoff role:<role>",
      },
      {
        name: "chatperms",
        description: "Toggle or undo per-user send-message permissions in the current channel.",
        subcommands: [
          { name: "toggle", description: "Toggle send-message permissions for a user." },
          { name: "undo", description: "Remove the user-specific permission overwrite." },
        ],
      },
      {
        name: "purge",
        description: "Delete messages in this channel (Discord-safe).",
        usage: "/purge confirm:CONFIRM",
      },
    ],
  },
  {
    id: "vod",
    label: "VODs & Streams",
    description: "Check Twitch VOD compliance and stream submissions.",
    commands: [
      {
        name: "vodcheck",
        description: "Check Twitch VODs for usernames posted in the current channel.",
        usage: "/vodcheck date:<YYYY-MM-DD> start:<HH:MM UTC> end:<HH:MM UTC>",
      },
      {
        name: "vodreport",
        description: "Check Twitch VOD compliance for event.",
        usage: "/vodreport date:<YYYY-MM-DD> start:<HH:MM UTC> end:<HH:MM UTC>",
      },
      {
        name: "voddive",
        description: "Post VOD publish times for an event window to mod log.",
        usage: "/voddive date:<YYYY-MM-DD> start:<HH:MM UTC> end:<HH:MM UTC>",
      },
      {
        name: "checklive",
        description: "Check which submitted Twitch links are currently live.",
      },
      {
        name: "teamstreamcheck",
        description: "Check accepted teams for missing streams.",
        usage: "/teamstreamcheck gamemode:<mode>",
      },
    ],
  },
  {
    id: "roles",
    label: "Roles & Members",
    description: "Role audits, member sync, and onboarding checks.",
    commands: [
      {
        name: "rolecheck",
        description: "Check whether all tagged users in the channel have a given role.",
        usage: "/rolecheck role:<role>",
      },
      {
        name: "roleclear",
        description: "Remove a role from every member who currently has it.",
        usage: "/roleclear role:<role>",
      },
      {
        name: "voicecheck",
        description: "Check whether all non-bot members with a role are in a voice channel.",
        usage: "/voicecheck role:<role>",
      },
      {
        name: "reactforrole",
        description: "Create or remove react-for-role messages.",
        subcommands: [
          { name: "create", description: "Post a message with emoji reactions that grant roles." },
          { name: "remove", description: "Stop tracking a react-for-role message." },
          { name: "edit", description: "Edit an existing react-for-role message." },
          { name: "adopt", description: "Attach react-role storage to an existing message." },
        ],
      },
      {
        name: "roleverifycheck",
        description: "Check which New Members also have the Yunite Verified role.",
      },
      {
        name: "syncgirlrole",
        description: "Sync everyone with the Girl role on Discord into the Girl Role sheet tab.",
      },
      {
        name: "applyunverifiedfemalerole",
        description: "Manual backfill: pending female role from Mod Log Gender Sheet (gender 50).",
        usage: "/applyunverifiedfemalerole dry_run:<bool>",
      },
      {
        name: "syncmembers",
        description: "Sync all Discord members to coedzbd.com.",
      },
      {
        name: "newmemberage",
        description: "List New Members who joined more than 30 days ago.",
      },
    ],
  },
  {
    id: "channels",
    label: "Channels & Comms",
    description: "Channel resets, exports, and scheduled DMs.",
    commands: [
      {
        name: "reset-channels",
        description: "Reset standard category channels by cloning them (clears all messages).",
        usage: "Run in a category channel; confirm via button prompt.",
      },
      {
        name: "say",
        description: "Post a message as the bot (confirmation is only visible to you).",
        usage: "/say channel:<channel> members:<@mentions or IDs> tag_only:<bool>",
      },
      {
        name: "export",
        description: "Export messages from a channel to a downloadable file.",
        usage: "/export channel:<channel> limit:<n> format:<format>",
      },
      {
        name: "dm",
        description: "Preview and schedule DMs to a user or role (posts to mod log for confirmation).",
        subcommands: [
          { name: "preview-user", description: "Preview a DM to a single user." },
          { name: "preview-role", description: "Preview a DM to everyone with a role." },
        ],
      },
    ],
  },
  {
    id: "data",
    label: "Data & Yunite",
    description: "Match submissions, Yunite stream control, and ban exports.",
    commands: [
      {
        name: "submit",
        description: "Submit match results from Yunite.",
        usage: "/submit id:<yunite tournament id> session:<1-12>",
      },
      {
        name: "yunite",
        description: "Start or stop the Yunite stream.",
        subcommands: [
          { name: "start", description: "Start the Yunite stream." },
          { name: "stop", description: "Stop the Yunite stream." },
        ],
      },
      {
        name: "banexport",
        description: "Export the server's Discord ban list (members and reasons) to a JSON file.",
      },
    ],
  },
];
