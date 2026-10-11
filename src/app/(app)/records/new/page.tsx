"use client";
import RecordForm from "@/components/RecordForm";
import { PageHeader } from "@/components/ui";

export default function NewRecordPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New Container Record" subtitle="IM7 must start with S · IM4 must start with C · Exit must start with X · expiry dates are calculated automatically" />
      <RecordForm mode="create" />
    </div>
  );
}
