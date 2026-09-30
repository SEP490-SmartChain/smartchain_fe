/** Mã hiển thị đơn con: `<mã đơn cha>-<số thứ tự>`, ví dụ `DH1234-1` (db.md §37). */
export function formatFulfillmentOrderCode(parentOrderCode: string, sequenceNo: number): string {
  return `${parentOrderCode}-${sequenceNo}`;
}
