/**
 * Client-side offline English-Vietnamese dictionary service.
 * Loads `/dictionary.json` lazily upon first query and caches it in memory.
 */

export interface DictionaryEntry {
  word: string;
  ipa: string;
  meaning: string;
}

type CompactDict = Record<string, [string, string]>;

let cachedDict: CompactDict | null = null;
let loadPromise: Promise<CompactDict> | null = null;
let sortedKeys: string[] = [];

async function getDict(): Promise<CompactDict> {
  if (cachedDict) return cachedDict;
  if (!loadPromise) {
    loadPromise = fetch('/dictionary.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load dictionary data');
        return res.json() as Promise<CompactDict>;
      })
      .then((data) => {
        cachedDict = data;
        sortedKeys = Object.keys(data);
        return data;
      })
      .catch((err) => {
        loadPromise = null;
        console.warn('[Dictionary] Failed to load offline dictionary:', err);
        return {};
      });
  }
  return loadPromise;
}

/** Preload dictionary in the background */
export function preloadDictionary(): void {
  void getDict();
}

/** Look up an exact word */
export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return null;
  const dict = await getDict();
  const entry = dict[normalized];
  if (!entry) return null;
  return {
    word: normalized,
    ipa: entry[0] || '',
    meaning: entry[1] || '',
  };
}

/** Get suggestions starting with the query (prefix search, max 8 results) */
export async function suggestWords(query: string, maxResults = 8): Promise<DictionaryEntry[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.length < 1) return [];
  const dict = await getDict();
  
  const results: DictionaryEntry[] = [];

  // If exact match exists, prioritize it first
  if (dict[normalized]) {
    results.push({
      word: normalized,
      ipa: dict[normalized][0] || '',
      meaning: dict[normalized][1] || '',
    });
  }

  // Find prefix matches
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    if (key === normalized) continue;
    if (key.startsWith(normalized)) {
      results.push({
        word: key,
        ipa: dict[key][0] || '',
        meaning: dict[key][1] || '',
      });
      if (results.length >= maxResults) break;
    }
  }

  return results;
}
