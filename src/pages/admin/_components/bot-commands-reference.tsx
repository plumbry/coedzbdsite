import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Search, Terminal } from "lucide-react";
import { BOT_COMMAND_CATEGORIES, type BotCommand, type BotCommandCategory } from "../_data/bot-commands.ts";

function commandMatchesQuery(command: BotCommand, query: string) {
  const haystack = [
    command.name,
    command.description,
    command.usage ?? "",
    ...(command.subcommands?.flatMap((sub) => [sub.name, sub.description]) ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function filterCategories(categories: BotCommandCategory[], query: string) {
  if (!query) return categories;

  return categories
    .map((category) => ({
      ...category,
      commands: category.commands.filter((command) => commandMatchesQuery(command, query)),
    }))
    .filter((category) => category.commands.length > 0);
}

function CommandRow({ command }: { command: BotCommand }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-2 py-0.5 text-sm font-medium">/{command.name}</code>
        {command.subcommands?.map((sub) => (
          <Badge key={sub.name} variant="outline" className="font-mono text-xs">
            {sub.name}
          </Badge>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{command.description}</p>
      {command.usage && (
        <p className="text-xs text-muted-foreground font-mono break-all">{command.usage}</p>
      )}
      {command.subcommands && command.subcommands.length > 0 && (
        <ul className="text-sm text-muted-foreground space-y-1 pl-4 list-disc">
          {command.subcommands.map((sub) => (
            <li key={sub.name}>
              <span className="font-medium text-foreground">{sub.name}</span>
              {" — "}
              {sub.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BotCommandsReference() {
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(
    () => filterCategories(BOT_COMMAND_CATEGORIES, search.trim().toLowerCase()),
    [search],
  );

  const totalCommands = useMemo(
    () => BOT_COMMAND_CATEGORIES.reduce((sum, category) => sum + category.commands.length, 0),
    [],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4" />
            Discord Bot Commands
          </CardTitle>
          <CardDescription>
            Reference for all {totalCommands} mod bot slash commands and what they do.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search commands..."
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {filteredCategories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No commands match your search.
          </CardContent>
        </Card>
      ) : (
        filteredCategories.map((category) => (
          <Card key={category.id}>
            <CardHeader>
              <CardTitle className="text-base">{category.label}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {category.commands.map((command) => (
                <CommandRow key={command.name} command={command} />
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
