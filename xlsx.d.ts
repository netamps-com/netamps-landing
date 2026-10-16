// Type declaration for SheetJS Community (xlsx) — no official types shipped
declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: { [name: string]: WorkSheet };
    Props?: any;
    cfb?: any;
  }

  export interface WorkSheet {
    [ref: string]: any;
    '!ref'?: string;
    '!cols'?: any[];
    '!rows'?: any[];
    '!margins'?: any;
    '!freeze'?: any;
  }

  export interface CommonOptions {
    type?: 'base64' | 'binary' | 'buffer' | 'array' | 'string' | 'file';
    cellDates?: boolean;
    cellText?: boolean;
    cellStyles?: boolean;
    cellFormula?: boolean;
    cellHTML?: boolean;
    cellNF?: boolean;
    cellSheet?: boolean;
    dense?: boolean;
    defval?: any;
    blankrows?: boolean;
    sheetRows?: number;
    dateNF?: string;
    bookVBA?: boolean;
    bookSheets?: boolean;
    bookFiles?: boolean;
    bookProps?: boolean;
    raw?: boolean;
    WTF?: boolean;
    FS?: string;
  }

  export interface ReadOptions extends CommonOptions {}
  export interface WriteOptions extends CommonOptions {
    bookType?: string;
    bookSST?: boolean;
  }

  export interface JSON2SheetOpts {
    header?: string[];
    skipHeader?: boolean;
  }

  export function read(data: any, opts?: ReadOptions): WorkBook;
  export function readFile(path: string, opts?: ReadOptions): WorkBook;
  export function writeFile(wb: WorkBook, file: string, opts?: WriteOptions): void;
  export function write(wb: WorkBook, opts?: WriteOptions): any;

  export namespace utils {
    function sheet_to_json<T = any>(ws: WorkSheet, opts?: CommonOptions & { header?: number | string[]; range?: string | number }): T[];
    function sheet_to_csv(ws: WorkSheet, opts?: CommonOptions): string;
    function aoa_to_sheet(data: any[][], opts?: JSON2SheetOpts): WorkSheet;
    function book_new(): WorkBook;
    function book_append_sheet(wb: WorkBook, ws: WorkSheet, name: string): void;
  }
}
