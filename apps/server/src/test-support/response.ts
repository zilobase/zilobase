export function responseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
