import { Search } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";

interface SearchInputProps extends Omit<React.ComponentProps<typeof Input>, "type"> {
  containerClassName?: string;
}

export default function SearchInput({
  className,
  containerClassName,
  placeholder = "Search…",
  ...props
}: SearchInputProps) {
  return (
    <div className={cn("relative w-full sm:w-64 min-w-0", containerClassName)}>
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
        aria-hidden
      />
      <Input
        type="search"
        placeholder={placeholder}
        className={cn("w-full pl-9", className)}
        {...props}
      />
    </div>
  );
}
