"use client";

import { createContext, useContext, useState } from "react";

// The client page's Edit state lives in ClientActions (a client component),
// but the dashboard sections it should hide while editing are rendered by the
// server page. This context lets the two meet: the page wraps its content in
// the provider and the hideable sections in <HideWhileEditing>.
const EditModeContext = createContext<{
  editing: boolean;
  setEditing: (editing: boolean) => void;
} | null>(null);

export function ClientEditModeProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <EditModeContext value={{ editing, setEditing }}>
      <div className={className}>{children}</div>
    </EditModeContext>
  );
}

/** Edit-mode state: shared when inside a provider, local otherwise. */
export function useEditing(): [boolean, (editing: boolean) => void] {
  const shared = useContext(EditModeContext);
  const [local, setLocal] = useState(false);
  return shared ? [shared.editing, shared.setEditing] : [local, setLocal];
}

export function HideWhileEditing({ children }: { children: React.ReactNode }) {
  const shared = useContext(EditModeContext);
  return shared?.editing ? null : <>{children}</>;
}
