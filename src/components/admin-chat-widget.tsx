import { useState, useRef, useEffect, useMemo } from "react";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { MessageCircle, X, Send } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export default function AdminChatWidget() {
  const { isAdmin, isLoading } = useUserRole();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    results: messageResults,
    status: messagesStatus,
    loadMore: loadOlderMessages,
  } = usePaginatedQuery(
    api.chat.getMessagesPaginated,
    isAdmin && isOpen ? {} : "skip",
    { initialNumItems: 30 },
  );
  const messages = useMemo(
    () =>
      [...messageResults].sort((a, b) => a._creationTime - b._creationTime),
    [messageResults],
  );
  const sendMessage = useMutation(api.chat.sendMessage);

  // Hide on /spin pages (public-facing, not admin)
  const isScrimsPage = location.pathname.startsWith("/spin");

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Don't render for non-admins or on scrims pages
  if (isLoading || !isAdmin || isScrimsPage) {
    return null;
  }

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessage("");
    await sendMessage({ text: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const unreadCount = 0; // Could be enhanced later with read tracking

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Chat Panel */}
      {isOpen && (
        <div className="absolute bottom-14 right-0 w-80 sm:w-96 h-[400px] max-h-[70vh] bg-background border rounded-xl shadow-xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Admin Chat</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 cursor-pointer"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {messagesStatus === "CanLoadMore" && (
              <div className="flex justify-center pb-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs cursor-pointer"
                  onClick={() => loadOlderMessages(30)}
                >
                  Load older messages
                </Button>
              </div>
            )}
            {messagesStatus === "LoadingFirstPage" && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Loading messages...
              </div>
            )}
            {messagesStatus !== "LoadingFirstPage" && messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No messages yet. Start the conversation!
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg._id} className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {msg.userName}
                </span>
                <div className="bg-muted/50 rounded-lg px-3 py-1.5 text-sm break-words">
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t px-3 py-2 flex gap-2">
            <Input
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              className="h-9 w-9 p-0 shrink-0 cursor-pointer"
              onClick={handleSend}
              disabled={!message.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <Button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "h-12 w-12 rounded-full shadow-lg p-0 cursor-pointer",
          isOpen && "bg-muted text-foreground hover:bg-muted/80"
        )}
        variant={isOpen ? "secondary" : "default"}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageCircle className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
