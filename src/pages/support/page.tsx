import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import { toast } from "sonner";
import { MessageSquare, CheckCircle } from "lucide-react";

export default function SupportPage() {
  const [discordUsername, setDiscordUsername] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const createTicket = useMutation(api.support.createTicket);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!discordUsername.trim()) {
      toast.error("Please enter your Discord username");
      return;
    }
    
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await createTicket({
        discordUsername: discordUsername.trim(),
        message: message.trim(),
      });
      
      setIsSubmitted(true);
      setDiscordUsername("");
      setMessage("");
      
      setTimeout(() => {
        setIsSubmitted(false);
      }, 5000);
    } catch (error) {
      console.error("Error submitting support ticket:", error);
      toast.error("Failed to submit support ticket. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <PageShell maxWidth="narrow">
      <PageHeader
        title="Support"
        icon={MessageSquare}
        description="Have an issue with your player info or want to submit your social links? Send us a message and we'll get back to you."
      />

      <Card>
        <CardContent className="pt-4">
          {isSubmitted ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-3">
              <div className="rounded-full bg-green-500/10 p-2">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold">Ticket Submitted!</h2>
              <p className="text-center text-sm text-muted-foreground">
                Thank you for contacting us. We'll review your message and get back to you soon.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSubmitted(false)}
              >
                Submit Another Ticket
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="discordUsername">Discord Username *</Label>
                <Input
                  id="discordUsername"
                  type="text"
                  placeholder="username#1234"
                  value={discordUsername}
                  onChange={(e) => setDiscordUsername(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your Discord username so we can identify you
                </p>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="message">Message *</Label>
                <Textarea
                  id="message"
                  placeholder="Describe your issue or request..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  disabled={isSubmitting}
                  rows={4}
                  className="w-full resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Examples: incorrect stats, missing social links, profile updates, etc.
                </p>
              </div>
              
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? "Submitting..." : "Submit Support Ticket"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
