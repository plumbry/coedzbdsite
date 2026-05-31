import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: Id<"players">;
}

export default function AddEventDialog({ open, onOpenChange, playerId }: AddEventDialogProps) {
  const createEvent = useMutation(api.events.createEvent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    eventName: "",
    eventDate: "",
    placement: "",
    eliminations: "",
    kdRatio: "",
    eventScore: "",
    yuniteLeaderboardUrl: "",
  });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await createEvent({
        playerId,
        eventName: formData.eventName,
        eventDate: formData.eventDate,
        placement: parseInt(formData.placement),
        eliminations: parseInt(formData.eliminations),
        kdRatio: parseFloat(formData.kdRatio),
        eventScore: parseInt(formData.eventScore),
        yuniteLeaderboardUrl: formData.yuniteLeaderboardUrl || undefined,
      });
      
      toast.success("Event added successfully!");
      onOpenChange(false);
      
      // Reset form
      setFormData({
        eventName: "",
        eventDate: "",
        placement: "",
        eliminations: "",
        kdRatio: "",
        eventScore: "",
        yuniteLeaderboardUrl: "",
      });
    } catch (error) {
      toast.error("Failed to add event. Please try again.");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add Event Result</DialogTitle>
          <DialogDescription>
            Enter the player's performance data for this event
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eventName">Event Name *</Label>
              <Input
                id="eventName"
                placeholder="FNCS Week 1"
                value={formData.eventName}
                onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="eventDate">Event Date *</Label>
              <Input
                id="eventDate"
                type="date"
                value={formData.eventDate}
                onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="placement">Placement *</Label>
              <Input
                id="placement"
                type="number"
                min="1"
                placeholder="1"
                value={formData.placement}
                onChange={(e) => setFormData({ ...formData, placement: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="eliminations">Eliminations *</Label>
              <Input
                id="eliminations"
                type="number"
                min="0"
                placeholder="15"
                value={formData.eliminations}
                onChange={(e) => setFormData({ ...formData, eliminations: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="kdRatio">K/D Ratio *</Label>
              <Input
                id="kdRatio"
                type="number"
                step="0.01"
                min="0"
                placeholder="2.50"
                value={formData.kdRatio}
                onChange={(e) => setFormData({ ...formData, kdRatio: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="eventScore">Event Score *</Label>
              <Input
                id="eventScore"
                type="number"
                min="0"
                placeholder="250"
                value={formData.eventScore}
                onChange={(e) => setFormData({ ...formData, eventScore: e.target.value })}
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="yuniteLeaderboardUrl">Yunite Leaderboard URL (Optional)</Label>
            <Input
              id="yuniteLeaderboardUrl"
              type="url"
              placeholder="https://yunite.gg/leaderboard/..."
              value={formData.yuniteLeaderboardUrl}
              onChange={(e) => setFormData({ ...formData, yuniteLeaderboardUrl: e.target.value })}
            />
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
