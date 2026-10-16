import { clsx } from "clsx";
import { Copy } from "./Copy";

export function AddressPill({ value, href, className }: { value: string; href?: string; className?: string }) {
  const short = value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <span className={clsx("ui-addr", className)} title={value}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">{short}</a>
      ) : (
        <span className="ui-addr__val">{short}</span>
      )}
      <Copy value={value} label="Copy address" />
    </span>
  );
}
