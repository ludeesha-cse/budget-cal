import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import * as XLSX from 'xlsx';
import { getCurrentDateString } from './date';
import {
  SHEET_ORDER,
  SHEET_COLUMNS,
  projectRow,
  type ExportWorkbookData,
} from './exportFormat';

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Builds the workbook strictly from utils/exportFormat.ts's shared
// SHEET_ORDER/SHEET_COLUMNS — every sheet gets a header row from
// SHEET_COLUMNS plus one row per item in `data[sheetName]`, projected
// through projectRow so the on-disk column order can never drift from
// the format constant. Every sheet in SHEET_ORDER is created even when
// its data array is empty, so an empty table still produces a sheet
// with just a header row rather than being omitted entirely — Stage
// 17b's importer will rely on every sheet always being present.
function buildWorkbook(data: ExportWorkbookData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const sheetName of SHEET_ORDER) {
    const header = SHEET_COLUMNS[sheetName];
    const rows = data[sheetName].map(row => projectRow(sheetName, row));
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  return workbook;
}

// Exports every table into a single .xlsx workbook, writes it to a temp
// path, and hands it to the OS share sheet so the user decides where it
// ends up (Files, Drive, email, AirDrop, ...) — this app never picks a
// destination or uploads anything itself. Returns the temp file path
// purely for logging/debugging; callers don't need to do anything with
// it since react-native-share already opened the share sheet.
export async function exportDataToExcel(
  data: ExportWorkbookData,
): Promise<string> {
  try {
    const workbook = buildWorkbook(data);
    // 'base64' rather than an ArrayBuffer/Buffer — react-native-fs's
    // writeFile only accepts a string payload (utf8 or base64), so this
    // is the standard way to get xlsx's binary output onto disk in a
    // React Native environment that has no Node Buffer.
    const base64 = XLSX.write(workbook, {
      type: 'base64',
      bookType: 'xlsx',
    }) as string;

    const filename = `budget-tracker-${getCurrentDateString()}.xlsx`;
    const path = `${RNFS.CachesDirectoryPath}/${filename}`;
    await RNFS.writeFile(path, base64, 'base64');

    try {
      await Share.open({
        url: `file://${path}`,
        filename,
        type: XLSX_MIME_TYPE,
      });
    } catch (shareError) {
      // react-native-share rejects its Promise when the user dismisses
      // the share sheet without picking anything — that's a normal
      // cancellation, not a failure of the export itself (the file was
      // already written successfully), so it's logged for visibility
      // during manual testing rather than rethrown to the caller.
      console.error(
        'exportDataToExcel: share sheet dismissed or failed',
        shareError,
      );
    }

    return path;
  } catch (error) {
    console.error(
      'exportDataToExcel: failed to build workbook or write export file',
      error,
    );
    throw error;
  }
}
