import { Button } from "@/components/ui/button.tsx";
import { Menu } from "lucide-react";

export default function AdminMobileHeader() {
  return (
    <div className="lg:hidden border-b bg-background fixed top-0 left-0 right-0 z-50 px-4 py-4">
      <Button 
        variant="ghost" 
        size="sm"
        onClick={() => {
          const event = new CustomEvent('toggleAdminSidebar');
          window.dispatchEvent(event);
        }}
        className="p-2 -ml-2"
      >
        <Menu className="h-5 w-5" />
      </Button>
    </div>
  );
}
