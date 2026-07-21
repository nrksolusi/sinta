import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { roleLabel } from "@/lib/roles";
import { sessionQueryOptions } from "@/lib/session";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const { data: invite, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () =>
      (await api.GET("/invites/{token}", { params: { path: { token } } }))
        .data ?? null,
  });
  const { data: session } = useQuery(sessionQueryOptions);

  const accept = async () => {
    const { data } = await api.POST("/invites/{token}/accept", {
      params: { path: { token } },
    });
    if (data) {
      queryClient.setQueryData(["session"], data);
      await navigate({ to: "/" });
    }
  };

  if (isLoading) return null;

  const redirectBack = `/invite/${token}`;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        {invite ? (
          <>
            <h1 className="text-2xl font-semibold">
              {m.invite_title({ tenant: invite.tenantName })}
            </h1>
            <p className="text-muted-foreground">
              {m.invite_role({ role: roleLabel(invite.role) })}
            </p>
            {session ? (
              <Button className="w-full" onClick={accept}>
                {m.invite_accept()}
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() =>
                    navigate({
                      to: "/login",
                      search: { redirect: redirectBack },
                    })
                  }
                >
                  {m.invite_login_first()}
                </Button>
                <p className="text-sm">
                  <Link
                    to="/register"
                    search={{ redirect: redirectBack }}
                    className="underline"
                  >
                    {m.invite_register_first()}
                  </Link>
                </p>
              </div>
            )}
          </>
        ) : (
          <p role="alert">{m.invite_invalid()}</p>
        )}
      </div>
    </main>
  );
}
