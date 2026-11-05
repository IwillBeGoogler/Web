import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { Toaster } from "sonner";

export const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY }, mutations: { retry: false } } });

/** Renders `ui` at every path of a memory router (Link / useNavigate work). */
export async function renderRouted(ui: ReactElement, { path = "/", qc = testQueryClient() } = {}) {
  const user = userEvent.setup();
  const root = createRootRoute();
  const any = createRoute({ getParentRoute: () => root, path: "$", component: () => ui });
  const index = createRoute({ getParentRoute: () => root, path: "/", component: () => ui });
  const router = createRouter({ routeTree: root.addChildren([index, any]), history: createMemoryHistory({ initialEntries: [path] }) });
  const r = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  await router.load();
  return { ...r, user, qc, router };
}
