import "server-only";
import { createHash } from "node:crypto";
import { LEGAL_DOCUMENTS, type LegalDocument, type LegalKey } from "./documents";

export function legalContentHash(doc: LegalDocument): string {
  return createHash("sha256")
    .update(JSON.stringify([doc.key, doc.version, doc.title, doc.body]))
    .digest("hex");
}

/** Payload para public.accept_legal_documents(). */
export function acceptancePayload(keys: LegalKey[]) {
  return keys.map((k) => {
    const doc = LEGAL_DOCUMENTS[k];
    return { key: doc.key, version: doc.version, hash: legalContentHash(doc) };
  });
}
