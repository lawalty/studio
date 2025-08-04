// src/ai/retrieval/preprocessing.ts
export const preprocessText = (text: string): string => {
  if (!text) return '';
  // 1. Convert to lowercase
  // 2. Replace multiple whitespace characters (including newlines, tabs) with a single space
  // 3. Remove punctuation and special characters, but keep alphanumeric and spaces
  // 4. Trim leading/trailing whitespace
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/gi, '')
    .trim();
};
