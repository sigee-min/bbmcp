export const encodeSseEvent = (data: string, event?: string, id?: string) => {
  const lines = data.split(/\r?\n/);
  const payload = lines.map((line) => `data: ${line}`).join('\n');
  const parts: string[] = [];
  if (id) parts.push(`id: ${id}`);
  if (event) parts.push(`event: ${event}`);
  parts.push(payload);
  return parts.join('\n') + '\n\n';
};

export const encodeSseComment = (comment: string) => `: ${comment}\n\n`;



