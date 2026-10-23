import { requireRole } from "@/lib/auth/current";
import { DRAWING_VIEW_ROLES } from "@/lib/drawings/server";
import DrawingViewer from "@/components/drawings/DrawingViewer";

// Data and the PDF load on the client so the viewer also opens from the phone's offline copy.
export default async function DrawingViewerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(DRAWING_VIEW_ROLES);
  const { id } = await params;
  return <DrawingViewer revisionId={id} />;
}
