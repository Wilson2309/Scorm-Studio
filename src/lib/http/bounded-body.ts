export class BodyTooLargeError extends Error {}
// Enforce a bound even with chunked requests and no Content-Length.
export async function boundedBody(request: Pick<Request,"body"|"headers">, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new BodyTooLargeError();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new BodyTooLargeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return bytes;
}
