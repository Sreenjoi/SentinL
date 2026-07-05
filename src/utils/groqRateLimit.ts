export function parseGroqResetMs(header: string | null): number {
  if (!header) return 15 * 60 * 1000; // 15 minutes default for missing/invalid
  
  header = header.trim().toLowerCase();
  
  const minMs = 5 * 1000; // 5 seconds
  const maxMs = 24 * 60 * 60 * 1000; // 24 hours
  
  const applyCaps = (ms: number) => {
      // Do not cap at 60s
      if (ms < minMs) return minMs;
      if (ms > maxMs) return maxMs;
      return ms;
  };
  
  if (header.endsWith('ms')) {
      const val = parseFloat(header.slice(0, -2));
      if (!isNaN(val)) return applyCaps(val);
  }
  
  const minSecMatch = header.match(/^(\d+(?:\.\d+)?)m(?:(\d+(?:\.\d+)?)s)?$/);
  if (minSecMatch) {
      let ms = parseFloat(minSecMatch[1]) * 60 * 1000;
      if (minSecMatch[2]) {
          ms += parseFloat(minSecMatch[2]) * 1000;
      }
      return applyCaps(ms);
  }
  
  if (header.endsWith('s')) {
      const val = parseFloat(header.slice(0, -1));
      if (!isNaN(val)) return applyCaps(val * 1000);
  }
  
  if (header.endsWith('m')) {
      const val = parseFloat(header.slice(0, -1));
      if (!isNaN(val)) return applyCaps(val * 60 * 1000);
  }
  
  if (header.endsWith('h')) {
      const val = parseFloat(header.slice(0, -1));
      if (!isNaN(val)) return applyCaps(val * 60 * 60 * 1000);
  }
  
  const plainNum = parseFloat(header);
  if (!isNaN(plainNum)) return applyCaps(plainNum * 1000); // plain numbers as seconds

  return 15 * 60 * 1000;
}
