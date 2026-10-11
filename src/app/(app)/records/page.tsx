import RecordsList from "@/components/RecordsList";

export const dynamic = "force-dynamic";

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const initial = { q: pick("q"), stage: pick("stage"), processing: pick("processing"), expiry: pick("expiry"), doc: pick("doc"), agent: pick("agent") };
  return <RecordsList key={JSON.stringify(initial)} initial={initial} />;
}
