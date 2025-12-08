// --- Code.gs (Backend API) ---
const SHEET_ID = "1pHpi4u9-gVv2ZCBg6MzcCdnRXJGUH0g1NQBWjZWbSzs"; // Pastikan ID ini benar
const SHEET_NAME = "Sheet1";

// Fungsi untuk menangani request dari GitHub (GET untuk ambil data, POST untuk simpan)
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    // 1. Jika mode "READ" (Ambil Data untuk Rekap)
    if (e.parameter.action === "read") {
      const data = sheet.getDataRange().getValues();
      data.shift(); // Hapus header
      const result = data.map(row => ({
        timestamp: row[0],
        teacher_name: row[1],
        date: Utilities.formatDate(new Date(row[2]), Session.getScriptTimeZone(), "yyyy-MM-dd"),
        status: row[3],
        notes: row[4]
      }));
      return responseJSON(result);
    }

    // 2. Jika mode "WRITE" (Simpan Absen)
    // Saat fetch dari luar, data ada di e.postData.contents
    const data = JSON.parse(e.postData.contents);
    
    sheet.appendRow([
      new Date(),
      data.teacher_name,
      data.date,
      data.status,
      data.notes
    ]);

    return responseJSON({ status: "success", message: "Data tersimpan" });

  } catch (error) {
    return responseJSON({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

// Fungsi pembantu agar bisa diakses dari GitHub (CORS)
function responseJSON(content) {
  return ContentService.createTextOutput(JSON.stringify(content))
    .setMimeType(ContentService.MimeType.JSON);
}