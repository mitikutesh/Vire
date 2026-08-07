/**
 * Hand a generated file to the browser.
 *
 * Extracted so the export flow is testable without driving jsdom's object-URL
 * plumbing: a test can replace this and assert on the payload it was given, which
 * is the part that matters.
 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Freed straight away: the click has already handed the blob to the browser,
  // and a leaked object URL keeps the whole export in memory for the session.
  URL.revokeObjectURL(url);
}
