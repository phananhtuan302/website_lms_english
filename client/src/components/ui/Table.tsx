import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/** Table wrapper (scroll container + rounded border). Put a real `<table>` inside, built from
 * `Table.Head`/`Table.Row`/`Table.HeaderCell`/`Table.Cell` plus a plain `<tbody>` — there's no
 * generic `data`/`columns` API, since some cells here mix a `Link` and a `button` together. */
function TableRoot({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className={cn('w-full min-w-[720px] text-left text-sm', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

function TableHead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500', className)} {...rest}>
      {children}
    </thead>
  );
}

function TableRow({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('border-t border-slate-100', className)} {...rest}>
      {children}
    </tr>
  );
}

function TableHeaderCell({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('px-4 py-3', className)} {...rest}>
      {children}
    </th>
  );
}

function TableCell({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3', className)} {...rest}>
      {children}
    </td>
  );
}

const Table = Object.assign(TableRoot, {
  Head: TableHead,
  Row: TableRow,
  HeaderCell: TableHeaderCell,
  Cell: TableCell,
});

export default Table;
