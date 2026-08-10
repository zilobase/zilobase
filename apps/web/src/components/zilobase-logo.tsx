import { cn } from "@/lib/utils"

export function ZilobaseLogo({ className }: { className?: string }) {
  return (
    <>
      <img
        alt=""
        aria-hidden="true"
        className={cn("block dark:hidden", className)}
        src="/zilobase-light.svg"
      />
      <img
        alt=""
        aria-hidden="true"
        className={cn("hidden dark:block", className)}
        src="/zilobase-dark.svg"
      />
    </>
  )
}
