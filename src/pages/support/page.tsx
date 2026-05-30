import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import SiteHeader from "@/components/site-header.tsx";
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
      
      // Reset success message after 5 seconds
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
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MessageSquare className="h-6 w-6" />
              Support
            </CardTitle>
            <CardDescription>
              Have an issue with your player info or want to submit your social links? Send us a message and we'll get back to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSubmitted ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="rounded-full bg-green-500/10 p-3">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                </div>
                <h3 className="text-xl font-semibold">Ticket Submitted!</h3>
                <p className="text-center text-muted-foreground">
                  Thank you for contacting us. We'll review your message and get back to you soon.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setIsSubmitted(false)}
                  className="mt-4"
                >
                  Submit Another Ticket
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="discordUsername">Discord Username *</Label>
                  <Input
                    id="discordUsername"
                    type="text"
                    placeholder="username#1234"
                    value={discordUsername}
                    onChange={(e) => setDiscordUsername(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your Discord username so we can identify you
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    placeholder="Describe your issue or request..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    disabled={isSubmitting}
                    rows={8}
                    className="resize-none"
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
      </div>
    </div>
  );
}
