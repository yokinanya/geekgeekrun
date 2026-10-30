let queue: Promise<unknown> = Promise.resolve()

export function exclusiveConfig<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => {}).then(action)
  queue = result
  return result
}
