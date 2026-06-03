import { HandleSSOCallback } from "@clerk/react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SsoCallbackPage() {
  const navigate = useNavigate();

  const navigateToPath = (url: string) => {
    if (url.startsWith("http")) {
      window.location.href = url;
      return;
    }
    navigate(url);
  };

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Completing sign in…</p>
      <HandleSSOCallback
        navigateToApp={({ decorateUrl }) => {
          navigateToPath(decorateUrl("/"));
        }}
        navigateToSignIn={() => navigate("/")}
        navigateToSignUp={() => navigate("/")}
      />
      <div id="clerk-captcha" />
    </div>
  );
}
