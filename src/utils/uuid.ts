import { randomUUID } from 'crypto';

/**
 * Validates a UUID v4 format
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Generates a new UUID v4
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Extracts GFS_ID from issue body HTML comment
 */
export function extractGfsId(body: string): string | null {
  const match = body.match(/<!-- GFS-ID:\s*([a-f0-9\-]+)\s*-->/i);
  return match ? match[1] : null;
}

/**
 * Inserts GFS_ID as HTML comment at the top of issue body
 */
export function insertGfsId(body: string, gfsId: string): string {
  // Remove existing GFS_ID comment if present
  const cleaned = body.replace(
    /<!-- GFS-ID:\s*[a-f0-9\-]+\s*-->\n*/i,
    ''
  );
  
  // Add new comment at the top
  return `<!-- GFS-ID: ${gfsId} -->\n${cleaned}`;
}

/**
 * Extracts content hash from issue body HTML comment
 */
export function extractContentHash(body: string): string | null {
  const match = body.match(/<!-- GFS-HASH:\s*([a-f0-9]+)\s*-->/i);
  return match ? match[1] : null;
}

/**
 * Inserts content hash as HTML comment in issue body
 */
export function insertContentHash(body: string, hash: string): string {
  // Remove existing hash comment if present
  const cleaned = body.replace(/<!-- GFS-HASH:\s*[a-f0-9]+\s*-->\n*/i, '');
  
  // Add hash after GFS-ID comment
  const hasGfsId = cleaned.match(/<!-- GFS-ID:.*-->/);
  if (hasGfsId) {
    return cleaned.replace(
      hasGfsId[0],
      `${hasGfsId[0]}\n<!-- GFS-HASH: ${hash} -->`
    );
  }
  
  return `<!-- GFS-HASH: ${hash} -->\n${cleaned}`;
}
