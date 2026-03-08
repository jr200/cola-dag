// ---------------------------------------------------------------------------
// URL-safe compression for DOT text (gzip + base64).
// Uses CompressionStream/DecompressionStream when available, falls back to
// plain base64.  Gzip is auto-detected on decode via the magic header.
// ---------------------------------------------------------------------------

function bytesToBase64(bytes) {
  var binary = "";
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(encoded) {
  var binary = atob(encoded);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function streamToBytes(readable) {
  var reader = readable.getReader();
  var chunks = [];
  var totalLen = 0;
  for (;;) {
    var result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    totalLen += result.value.length;
  }
  var out = new Uint8Array(totalLen);
  var offset = 0;
  chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
  return out;
}

export async function compressDot(text) {
  var bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream !== "undefined") {
    var cs = new CompressionStream("gzip");
    var writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    bytes = await streamToBytes(cs.readable);
  }
  return bytesToBase64(bytes);
}

export async function decompressDot(encoded) {
  var bytes = base64ToBytes(encoded);
  // Detect gzip magic header (0x1f 0x8b)
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== "undefined") {
      var ds = new DecompressionStream("gzip");
      var writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      bytes = await streamToBytes(ds.readable);
    }
  }
  return new TextDecoder().decode(bytes);
}
