/** Transaction owners collect delivery work; standalone services deliver after their own commit. */
export type AfterCommit = (operation: () => Promise<unknown>) => void;

export async function deliverAfterCommit(
  operation: () => Promise<unknown>,
  register?: AfterCommit,
) {
  if (register) register(operation);
  else await operation();
}
