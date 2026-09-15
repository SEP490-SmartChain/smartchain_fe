interface ComponentPageShellProps {
  title: string;
  children: React.ReactNode;
}

export default function ComponentPageShell({ title, children }: ComponentPageShellProps) {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">{title}</h1>
      {children}
    </div>
  );
}
