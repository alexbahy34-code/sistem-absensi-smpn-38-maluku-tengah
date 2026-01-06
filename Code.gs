/**
 * ------------------------------------------------------------------
 * BACKEND SYSTEM - E-ABSENSI SMPN 38 MALUKU TENGAH (V3.0 - SECURE)
 * ------------------------------------------------------------------
 */

const SHEET_ID = "1pHpi4u9-gVv2ZCBg6MzcCdnRXJGUH0g1NQBWjZWbSzs"; // ID Spreadsheet Anda
const SHEET_ABSENSI = "Absensi";
const SHEET_PEGAWAI = "DataPegawai";

// --- GANTI PASSWORD DI SINI (Hanya Anda yang tahu) ---
const APP_PASSWORD = "smpn38mt"; 

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.tryLock(10000);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    setupSheets(ss);

    const params = e.parameter;
    
    // 1. GET Requests
    if (params.action === "getPegawai") return getPegawaiList(ss);
    if (params.action === "check") return handleCheckAbsence(ss, params.date);

    // 2. POST Requests (Butuh Password)
    if (e.postData && e.postData.contents) {
      const req = JSON.parse(e.postData.contents);

      // KHUSUS LOGIN: Cek password saja
      if (req.action === "login") {
        if (req.password === APP_PASSWORD) {
          return responseJSON({ status: "success", message: "Login Berhasil" });
        } else {
          return responseJSON({ status: "error", message: "Password Salah" });
        }
      }

      // UNTUK AKSI LAIN: Validasi Password lagi
      if (req.password !== APP_PASSWORD) {
        return responseJSON({ status: "error", message: "⛔ Akses Ditolak: Password Salah!" });
      }

      if (req.action === "simpanAbsen") return handleSaveAbsence(ss, req);
      if (req.action === "tambahPegawai") return handleAddPegawai(ss, req);
      if (req.action === "hapusPegawai") return handleDeletePegawai(ss, req);
    }
    
    return responseJSON({ status: "error", message: "Invalid Request" });

  } catch (error) {
    return responseJSON({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

// --- LOGIC FUNCTIONS ---
function setupSheets(ss) {
  let sheetAbsen = ss.getSheetByName(SHEET_ABSENSI);
  if (!sheetAbsen) {
    sheetAbsen = ss.insertSheet(SHEET_ABSENSI);
    sheetAbsen.appendRow(["Timestamp", "Nama Guru", "Tanggal Absen", "Status", "Catatan"]);
  }
  let sheetPegawai = ss.getSheetByName(SHEET_PEGAWAI);
  if (!sheetPegawai) {
    sheetPegawai = ss.insertSheet(SHEET_PEGAWAI);
    sheetPegawai.appendRow(["Nama Pegawai"]);
    // Data default dihapus disini agar tidak menimpa, asumsi sheet sudah ada
  }
}

function getPegawaiList(ss) {
  const sheet = ss.getSheetByName(SHEET_PEGAWAI);
  const data = sheet.getDataRange().getValues();
  const list = data.slice(1).map(row => row[0]).filter(name => name !== "").sort();
  return responseJSON({ status: "success", data: list });
}

function handleAddPegawai(ss, req) {
  const sheet = ss.getSheetByName(SHEET_PEGAWAI);
  const data = sheet.getDataRange().getValues();
  const exist = data.some(row => row[0].toLowerCase() === req.nama.toLowerCase());
  if (exist) return responseJSON({ status: "error", message: "Nama pegawai sudah ada!" });
  sheet.appendRow([req.nama]);
  sheet.getRange(2, 1, sheet.getLastRow()-1, 1).sort(1);
  return responseJSON({ status: "success", message: "Pegawai berhasil ditambahkan" });
}

function handleDeletePegawai(ss, req) {
  const sheet = ss.getSheetByName(SHEET_PEGAWAI);
  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === req.nama) { rowIndex = i + 1; break; }
  }
  if (rowIndex > 0) {
    sheet.deleteRow(rowIndex);
    return responseJSON({ status: "success", message: "Pegawai berhasil dihapus" });
  } else {
    return responseJSON({ status: "error", message: "Nama tidak ditemukan" });
  }
}

function handleCheckAbsence(ss, targetDate) {
  const sheet = ss.getSheetByName(SHEET_ABSENSI);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return responseJSON({ status: "success", history: {} });
  const history = {};
  data.slice(1).forEach(row => {
    const rowDate = Utilities.formatDate(new Date(row[2]), Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (rowDate === targetDate) history[row[1]] = { status: row[3] };
  });
  return responseJSON({ status: "success", history: history });
}

function handleSaveAbsence(ss, req) {
  const sheet = ss.getSheetByName(SHEET_ABSENSI);
  const data = sheet.getDataRange().getValues();
  const isDuplicate = data.slice(1).some(row => {
    const rowDate = Utilities.formatDate(new Date(row[2]), Session.getScriptTimeZone(), "yyyy-MM-dd");
    return row[1] === req.teacher_name && rowDate === req.date;
  });
  if (isDuplicate) return responseJSON({ status: "error", message: "Pegawai ini sudah diabsen hari ini!" });
  sheet.appendRow([new Date(), req.teacher_name, req.date, req.status, req.notes || ""]);
  return responseJSON({ status: "success", message: "Data berhasil disimpan" });
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

