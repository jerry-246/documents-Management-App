import { db } from "@/db";
import { audit, logValidationErrors } from "@/lib/audit";
import { HttpError, readJson, route } from "@/lib/api";
import { checkInput, createRecord, getCtx } from "@/lib/records";

export const dynamic = "force-dynamic";

export const POST = route("records.import", async ({ req, actor }) => {
  const b = await readJson(req);
  const rows = Array.isArray(b.rows) ? (b.rows as Record<string, unknown>[]) : [];
  if (!rows.length) throw new HttpError(400, "No rows to import.");
  if (rows.length > 2000) throw new HttpError(400, "Too many rows (max 2000).");
  const ctx = await getCtx();
  const seen = new Set<string>();
  const results = [];
  for (let index = 0; index < rows.length; index++) {
    const r = await checkInput(rows[index], ctx);
    const keys = [
      r.input.invoiceNo && r.input.containerNo ? `ic:${r.input.invoiceNo.toLowerCase()}|${r.input.containerNo}` : "",
      r.input.im7No ? `im7:${r.input.im7No.toLowerCase()}` : "",
      r.input.im4No ? `im4:${r.input.im4No.toLowerCase()}` : "",
    ].filter(Boolean);
    const fileDuplicate = !r.errors.length && keys.some((k) => seen.has(k));
    if (!r.errors.length) keys.forEach((k) => seen.add(k));
    results.push({ index, input: r.input, errors: r.errors, duplicates: r.duplicates, fileDuplicate, expiry: r.expiry });
  }
  const invalid = results.filter((r) => r.errors.length);
  const dupes = results.filter((r) => !r.errors.length && (r.duplicates.length || r.fileDuplicate));
  const summary = { total: results.length, valid: results.length - invalid.length - dupes.length, invalid: invalid.length, duplicates: dupes.length };
  if (b.commit !== true) return { results, summary };

  const mode = b.mode === "all_or_nothing" ? "all_or_nothing" : "valid_only";
  const importDuplicates = b.importDuplicates === true;
  for (const r of invalid)
    await logValidationErrors(r.errors, actor, { invoiceNo: r.input.invoiceNo, containerNo: r.input.containerNo, source: "import" });
  if (mode === "all_or_nothing" && (invalid.length || (dupes.length && !importDuplicates)))
    throw new HttpError(422, "Import cancelled: some rows are invalid or duplicated (all-or-nothing mode).", { results, summary });

  let imported = 0;
  const failed: { index: number; error: string }[] = [];
  for (const r of results) {
    if (r.errors.length) continue;
    if ((r.duplicates.length || r.fileDuplicate) && !importDuplicates) continue;
    try {
      await createRecord(rows[r.index], actor, { confirmDuplicate: true, source: "import" });
      imported++;
    } catch (e) {
      failed.push({ index: r.index, error: e instanceof Error ? e.message : "Failed" });
    }
  }
  await audit(db, {
    actor, action: "excel_import",
    newValue: `${imported} imported, ${invalid.length} invalid, ${dupes.length} duplicate, ${failed.length} failed (mode: ${mode})`,
  });
  return { imported, skippedInvalid: invalid.length, skippedDuplicates: importDuplicates ? 0 : dupes.length, failed };
});
