import { HeuristicProcessor } from "/dev-server/src/lib/doc-processors.server.ts";
import { readFileSync } from "fs";
const p = new HeuristicProcessor();
for (const [f,m] of [["stmt.csv","text/csv"],["stmt.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],["supplier_invoice.pdf","application/pdf"],["photo.jpg","image/jpeg"]]) {
  let bytes; try { bytes = new Uint8Array(readFileSync("/tmp/dt/"+f)); } catch { bytes = new Uint8Array(10); }
  const x = await p.process({ fileName: f, mimeType: m, bytes, hints:{suppliers:["Gulf Steel Trading LLC"],customers:[]} } as any);
  console.log(f, x.doc_type, x.doc_type_confidence, "txns", x.transactions?.length ?? 0, JSON.stringify(Object.fromEntries(Object.entries(x.fields).map(([k,v]:any)=>[k,v.value]))), JSON.stringify(x.lines));
}
