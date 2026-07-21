import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>This is an authenticated page</div>
}
