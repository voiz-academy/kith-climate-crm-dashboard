import { supabase } from './supabase'

const cache = new Map<string, string>()

/**
 * Fetch a secret from the kith_climate.app_secrets table.
 * Values are cached in-memory for the lifetime of the request/worker.
 */
export async function getSecret(key: string): Promise<string | undefined> {
  if (cache.has(key)) return cache.get(key)

  const { data, error } = await supabase
    .from('app_secrets')
    .select('value')
    .eq('key', key)
    .single()

  if (error || !data) return undefined

  cache.set(key, data.value)
  return data.value
}

/**
 * Fetch multiple secrets at once.
 * Returns a map of key -> value for all found secrets.
 */
export async function getSecrets(keys: string[]): Promise<Record<string, string>> {
  const uncached = keys.filter(k => !cache.has(k))

  if (uncached.length > 0) {
    const { data } = await supabase
      .from('app_secrets')
      .select('key, value')
      .in('key', uncached)

    if (data) {
      for (const row of data) {
        cache.set(row.key, row.value)
      }
    }
  }

  const result: Record<string, string> = {}
  for (const key of keys) {
    const val = cache.get(key)
    if (val) result[key] = val
  }
  return result
}
