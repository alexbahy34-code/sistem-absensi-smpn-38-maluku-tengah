/**
 * ------------------------------------------------------------------
 * BACKEND SYSTEM - E-ABSENSI SMPN 38 MALUKU TENGAH (V4.0 - REKAP)
 * ------------------------------------------------------------------
 */

const SHEET_ID = "1pHpi4u9-gVv2ZCBg6MzcCdnRXJGUH0g1NQBWjZWbSzs"; // ID Spreadsheet Anda
const SHEET_ABSENSI = "Absensi";
const SHEET_PEGAWAI = "DataPegawai";
const APP_PASSWORD = "smpn38kepsek"; 

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.tryLock(10000);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    setupSheets(ss);

    const params = e.parameter;
    
    // --- GET REQUESTS ---
    // 1. Ambil Daftar Nama
    if (params.action === "getPegawai") return getPegawaiList(ss);
    
    // 2. Cek Absen Harian (Untuk tampilan depan)
    if (params.action === "check") return handleCheckAbsence(ss, params.date);

    // 3. FITUR BARU: AMBIL REKAP (Mingguan/Bulanan/Semester)
    if (params.action === "getRekap") {
      return generateRekap(ss, params.period);
    }

    // --- POST REQUESTS (Login & Edit Data) ---
    if (e.postData && e.postData.contents) {
      const req = JSON.parse(e.postData.contents);

      if (req.action === "login") {
        return req.password === APP_PASSWORD 
          ? responseJSON({ status: "success", message: "Login Berhasil" }) 
          : responseJSON({ status: "error", message: "Password Salah" });
      }

      // Validasi Password untuk aksi tulis
      if (req.password !== APP_PASSWORD) {
        return responseJSON({ status: "error", message: "⛔ Akses Ditolak!" });
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

// --- LOGIC BARU: GENERATE REKAP ---
function generateRekap(ss, period) {
  const sheetAbsen = ss.getSheetByName(SHEET_ABSENSI);
  const data = sheetAbsen.getDataRange().getValues();
  // Data: [Timestamp, Nama, Tanggal, Status, Catatan]
  
  const now = new Date();
  const summary = {}; // Format: { "NamaGuru": {H:0, S:0, I:0, A:0} }

  // Loop data absensi (skip header)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const nama = row[1];
    const tglAbsen = new Date(row[2]);
    const status = row[3];

    // Cek apakah tanggal ini masuk dalam periode yang diminta
    if (isInPeriod(tglAbsen, now, period)) {
      if (!summary[nama]) {
        summary[nama] = { H: 0, S: 0, I: 0, A: 0 };
      }
      // Increment status
      if (status === 'Hadir') summary[nama].H++;
      else if (status === 'Sakit') summary[nama].S++;
      else if (status === 'Izin') summary[nama].I++;
      else if (status === 'Alpha') summary[nama].A++;
    }
  }

  // Ubah object ke array untuk dikirim ke frontend
  const result = Object.keys(summary).map(key => {
    const s = summary[key];
    // Hitung persentase kehadiran (opsional)
    const total = s.H + s.S + s.I + s.A;
    const persentase = total === 0 ? 0 : Math.round((s.H / total) * 100);
    return {
      nama: key,
      h: s.H,
      s: s.S,
      i: s.I,
      a: s.A,
      persen: persentase
    };
  });

  // Sort berdasarkan persentase kehadiran tertinggi
  result.sort((a, b) => b.persen - a.persen);

  return responseJSON({ status: "success", data: result, period: period });
}

// Helper: Cek Tanggal
function isInPeriod(dateToCheck, today, period) {
  const d = new Date(dateToCheck);
  const t = new Date(today);

  // Reset jam agar perbandingan murni tanggal
  d.setHours(0,0,0,0);
  t.setHours(0,0,0,0);

  if (period === 'mingguan') {
    // Cari hari Senin minggu ini
    const day = t.getDay() || 7; // Get current day number, converting Sun. to 7
    if(day !== 1) t.setHours(-24 * (day - 1)); 
    const startOfWeek = new Date(t);
    const endOfWeek = new Date(t);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return d >= startOfWeek && d <= endOfWeek;
  }
  
  if (period === 'bulanan') {
    return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
  }

  if (period === 'semester') {
    const currentMonth = t.getMonth(); // 0-11
    const checkMonth = d.getMonth();
    const checkYear = d.getFullYear();
    const currentYear = t.getFullYear();

    // Semester 1 (Ganjil): Juli (6) - Desember (11)
    // Semester 2 (Genap): Januari (0) - Juni (5)
    
    if (currentMonth >= 6) { // Kita ada di Sem. Ganjil
      return checkYear === currentYear && checkMonth >= 6;
    } else { // Kita ada di Sem. Genap
      return checkYear === currentYear && checkMonth <= 5;
    }
  }

  return false;
}

// --- FUNGSI LAINNYA (SAMA SEPERTI SEBELUMNYA) ---
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
