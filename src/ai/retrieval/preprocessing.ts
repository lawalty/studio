// src/ai/retrieval/preprocessing.ts
export const preprocessText = (text: string): string => {
  if (!text) return '';
  // Convert to lowercase and normalize whitespace
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
};
