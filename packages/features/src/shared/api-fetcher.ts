export type ApiFetcher = <T>(path: string, init?: RequestInit) => Promise<T>
