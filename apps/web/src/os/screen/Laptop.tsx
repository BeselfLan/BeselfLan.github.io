import type { ReactNode } from "react";

// A stub with its final props (plan 2.7, #67). `children` is the Screen, which
// fills its parent, so this fills the viewport. The boot child (#13) adds the
// bezel and the lid and gives the Screen its real size; it keeps rendering
// `children` and keeps a real size for them.
export function Laptop({ children }: { children: ReactNode }) {
  return (
    <div data-laptop="" className="absolute inset-0">
      {children}
    </div>
  );
}
