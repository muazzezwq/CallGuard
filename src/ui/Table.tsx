import type { HTMLAttributes, ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { clsx } from "clsx";

export function TableWrap({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("ui-table__scroll", className)} {...rest}>{children}</div>;
}

export function Table({ dense, className, children, ...rest }: TableHTMLAttributes<HTMLTableElement> & { dense?: boolean }) {
  return (
    <table className={clsx("ui-table", dense && "ui-table--dense", className)} {...rest}>
      {children}
    </table>
  );
}

export function Tr({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={className} {...rest}>{children}</tr>;
}

export function Th({ num, className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <th scope="col" className={clsx(num && "num", className)} {...rest}>{children}</th>;
}

export function Td({ num, mono, trunc, className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean; mono?: boolean; trunc?: boolean }) {
  return (
    <td className={clsx(num && "num", mono && "mono", trunc && "trunc", className)} {...rest}>
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="ui-table__empty">{children}</td>
      </tr>
    </tbody>
  );
}
