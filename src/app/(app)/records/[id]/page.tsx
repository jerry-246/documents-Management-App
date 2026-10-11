import { notFound } from "next/navigation";
import RecordDetail from "@/components/RecordDetail";

export const dynamic = "force-dynamic";

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  return <RecordDetail id={id} />;
}
